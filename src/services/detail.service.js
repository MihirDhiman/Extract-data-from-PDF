import { PDFExtract } from "pdf.js-extract";
// import { getAllPdfFiles } from "../helpers/pathHelper.js";
import path from "path";``

// Groups text on a PDF page into rows
const extractRows = (page) => {
  const Y_TOLERANCE = 3;
  const yGroups = [];

  for (const item of page.content) {
    const y = item.y;
    let foundGroup = yGroups.find(
      (group) => Math.abs(group.y - y) <= Y_TOLERANCE
    );

    if (foundGroup) {
      foundGroup.items.push(item);
    } else {
      yGroups.push({ y, items: [item] });
    }
  }

  yGroups.sort((a, b) => a.y - b.y);

  return yGroups.map((group) =>
    group.items.sort((a, b) => a.x - b.x)
  );
};

// Hardcoded function to ignore known header/footer strings and section titles
const shouldIgnoreDetailRow = (text) => {
  const normalizedText = text.toLowerCase().trim();

  // 1. LIcense ID: ---anynumber
  if (/license id:\s*-+\s*\d+/i.test(normalizedText)) return true;

  // 2. Computer name: OSD-QC-Tiamo
  if (/computer name:\s*osd-qc-tiamo/i.test(normalizedText)) return true;
  
  // 3. User (short name): [ANY NAME] - Updated to match any name
  if (/user \(short name\):\s*.*$/i.test(normalizedText)) return true;

  // 4. Printed: 2025-08-14 16:37:15 UTC+5:30
  if (/printed:\s*\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}:\d{2}\s*utc[+-]\d{1,2}:\d{2}/i.test(normalizedText)) return true;

  // 5. tiamo 2.5 Build 116
  if (/tiamo\s*\d+\.\d+\s*build\s*\d+/i.test(normalizedText)) return true;
  
  // 6. Ignore standalone section titles "Audit Trial"
  if (normalizedText === "audit trail") return true;

  // 7. Ignore standalone section titles "Details"
  if (normalizedText === "details") return true;

  // 8. Ignore page numbers (e.g., "Page 889 of 3448")
  if (/^page\s+\d+\s+of\s+\d+$/i.test(normalizedText)) return true;

  // 9. Ignore standalone numbers (the problematic serial numbers)
  // if (/^\d+$/.test(text.trim())) return true; 

  return false;
}

// Function to check if a row likely starts a new, distinct detail entry
const isNewDetailEntryStart = (text) => {
    // Regex for:
    // 1. Starts with "1 Name:", "2 Name:", etc.
    // 2. Starts with "Program 'Tiamo 2.5 Build 116'" (or similar)
    // 3. Starts with "User: 'Abhairajsharma'" (or similar)
    // 4. Starts with a digit followed by a space and a word (e.g., "5 Determination ID:")
    const newEntryPatterns = [
        /^\d+\s+(Name|Program|User):/,
        /^\d+\s+Determination\s+ID:/,
        /^Program\s+'Tiamo\s+.*'/,
        /^User:\s+'[^']+'/
    ];
    return newEntryPatterns.some(pattern => pattern.test(text.trim()));
}


// extracts only Details 
// This function is designed to be called file-by-file from audit.service.js
export const extractDetailsOnly = async (filePath) => {
  if (!filePath) {
    console.error("No file path provided to extractDetailsOnly");
    return [];
  }

  try {
    const pdfExtract = new PDFExtract();
    
    // Extract raw data from PDF
    const data = await new Promise((resolve, reject) => {
      pdfExtract.extract(filePath, {}, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    let currentDetailText = "";
    let detailEntries = [];

    // Go through each page
    for (const page of data.pages) {
      const rows = extractRows(page);

      // Detect if this page likely contains full table headers (main audit log)
      const hasHeader = rows.some(
        (row) =>
          row.some((i) => i.str.toLowerCase().includes("type")) &&
          row.some((i) => i.str.toLowerCase().includes("date")) &&
          row.some((i) => i.str.toLowerCase().includes("user"))
      );

      // Skip pages containing the main audit log table
      if (hasHeader) continue;

      // Process rows in the detail section
      for (const row of rows) {
        // Concatenate all text items in the row
        const text = row.map((i) => i.str.trim()).join(" ").trim();
        
        // Skip ignored rows (headers, footers, etc.)
        if (!text || shouldIgnoreDetailRow(text)) {
            continue;
        }

        // Check if the current line starts a new detail entry
        if (isNewDetailEntryStart(text)) {
            // If we have existing accumulated text, finalize it as a detail entry
            if (currentDetailText) {
                detailEntries.push({ details: currentDetailText });
            }
            // Start a new entry
            currentDetailText = text;
        } else {
            // Otherwise, append the current line to the current detail entry
            // This handles wrapped text (the issue you highlighted)
            if (currentDetailText) {
                currentDetailText += " " + text;
            } else {
                // If it's not a new start and currentDetailText is empty, 
                // it might be the very first line of details.
                currentDetailText = text;
            }
        }
      }
    }

    // Finalize the last accumulated entry
    if (currentDetailText) {
        detailEntries.push({ details: currentDetailText });
    }
    
    //RETURN the details array for merging
    return detailEntries;
  } catch (error) {
    console.error(
      `Error extracting details from ${path.basename(filePath)}:`,
      error.message
    );
    // Return empty array on error so merging can continue
    return [];
  }
};

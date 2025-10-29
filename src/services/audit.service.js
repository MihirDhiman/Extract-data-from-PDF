import { PDFExtract } from "pdf.js-extract";
import { getAllPdfFiles } from "../helpers/pathHelper.js";
import AuditLog from "../models/audit.js";
import path from "path";
import { extractDetailsOnly } from "./detail.service.js";

// Groups text on a PDF page into rows
const extractRows = (page) => {
  const Y_TOLERANCE = 3;
  const yGroups = [];

  for (const item of page.content) {
    const y = item.y;
    let foundGroup = yGroups.find((group) => Math.abs(group.y - y) <= Y_TOLERANCE);

    if (foundGroup) foundGroup.items.push(item);
    else yGroups.push({ y, items: [item] });
  }

  yGroups.sort((a, b) => a.y - b.y);

  return yGroups.map((group) => group.items.sort((a, b) => a.x - b.x));
};

// Finds column start and end positions
const determineColumnBoundaries = (headerRow) => {
  const sortedItems = [...headerRow].sort((a, b) => a.x - b.x);
  return sortedItems.map((item, index) => {
    const nextItem = sortedItems[index + 1];
    return {
      name: item.str.trim(),
      xStart: item.x,
      xEnd: nextItem ? nextItem.x : Infinity,
    };
  });
};

// Maps each row item to the correct column
const mapRowToColumns = (rowItems, columnBoundaries) => {
  const result = {};
  columnBoundaries.forEach((col) => (result[col.name] = null));

  rowItems.forEach((item) => {
    const x = item.x;
    const text = item.str.trim();

    for (let col of columnBoundaries) {
      if (x >= col.xStart && x < col.xEnd) {
        result[col.name] = result[col.name] ? result[col.name] + " " + text : text;
        break;
      }
    }
  });

  // Simple post-processing to consolidate multi-part column data (like a date being split)
  for (const key in result) {
    if (typeof result[key] === 'string') {
        result[key] = result[key].replace(/\s+/g, ' ').trim();
    }
  }

  return result;
};

// Function to ignore header/footer rows that are not part of the main audit table
const shouldIgnoreMainAuditRow = (row, columnBoundariesFound) => {
    const rowText = row.map((i) => i.str.trim()).join(" ").trim();
    const normalizedText = rowText.toLowerCase();

    if (!rowText) return true;

   
    // 1. tiamo 2.5 Build 116 (Header info)
    if (/tiamo\s*\d+\.\d+\s*build\s*\d+/i.test(normalizedText)) return true;
    
    // 2. Computer name: OSD-QC-Tiamo (Header info)
    if (/computer name:\s*.*$/i.test(normalizedText)) return true;
    
    // 3. User (short name): [ANY NAME] (Header info)
    if (/user \(short name\):\s*.*$/i.test(normalizedText)) return true;

    // 4. LIcense ID: ---anynumber (Header info)
    if (/license id:\s*-+\s*\d+/i.test(normalizedText)) return true;
    
    // 5. Printed: [DATE TIME] (Header info)
    if (/printed:\s*\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}:\d{2}\s*utc[+-]\d{1,2}:\d{2}/i.test(normalizedText)) return true;

    // 6. Page numbers (e.g., "Page 889 of 3448") (Footer info)
    if (/^page\s+\d+\s+of\s+\d+$/i.test(normalizedText)) return true;
    
    // 7. Ignore "Audit Trail" as a standalone section title (Common Page Header)
    // We filter this out as a header, but must ensure we don't accidentally filter out a valid row containing this text.
    if (row.length === 1 && normalizedText === "audit trail") return true;

    // This is to ignore duplicate headers that appear on subsequent pages of the table
    if (columnBoundariesFound) {
        // A rough check to see if the row contains most of the column names
        const isHeaderPattern = 
            normalizedText.includes("type") &&
            normalizedText.includes("date") &&
            normalizedText.includes("user") &&
            normalizedText.includes("action");
            
        if (isHeaderPattern) return true;
    }

    return false;
};

// Main extraction and merging
export const extractAndSaveAuditData = async () => {
  const pdfFiles = getAllPdfFiles();
  if (pdfFiles.length === 0) {
    console.error("⚠️ No PDF files found in /public");
    return;
  }

  let totalSaved = 0;

  for (const filePath of pdfFiles) {
    const pdfExtract = new PDFExtract();
    const fileName = path.basename(filePath);

    try {
      // Extract main audit data
      const data = await new Promise((resolve, reject) => {
        pdfExtract.extract(filePath, {}, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });

      let columnBoundaries = null;
      let collectedRows = [];

      for (const page of data.pages) {
        // Get raw rows for the current page
        const rows = extractRows(page); 
        // Filter out non-data/non-header rows (passing a flag if boundaries were found)
        const filteredRows = rows.filter(r => !shouldIgnoreMainAuditRow(r, !!columnBoundaries));
        
        // Try to find the header row on the current page if not already found
        if (!columnBoundaries) {
          const headerIndex = filteredRows.findIndex(
            (row) =>
              row.some((i) => i.str.toLowerCase().includes("type")) &&
              row.some((i) => i.str.toLowerCase().includes("date")) &&
              row.some((i) => i.str.toLowerCase().includes("user"))
          );

          if (headerIndex !== -1) {
            const headerRow = filteredRows[headerIndex];
            columnBoundaries = determineColumnBoundaries(headerRow);
            // Start collecting data rows after the header
            collectedRows.push(...filteredRows.slice(headerIndex + 1));
            continue;
          }
        } else {
            // If header found, collect all rows from subsequent pages.
            // Note: Filter 8 in shouldIgnoreMainAuditRow will remove subsequent headers here.
            collectedRows.push(...filteredRows);
        }
      }

      if (!columnBoundaries) {
        console.error(`⚠️ Header not found in ${fileName}. Skipping.`);
        continue;
      }

      const columnMapping = {
        type: /type/i,
        date: /date/i,
        user: /user/i,
        fullName: /full\s*name/i,
        client: /client/i,
        category: /category/i,
        action: /action/i,
        details: /details?/i,
        archive: /archive/i,
      };

      const headerMap = {};
      columnBoundaries.forEach((col) => {
        const colName = col.name.toLowerCase().trim();
        for (let [key, pattern] of Object.entries(columnMapping)) {
          if (pattern.test(colName)) headerMap[col.name] = key;
        }
      });

      const cleanedRows = collectedRows.map((rowItems) => {
        const mappedRow = mapRowToColumns(rowItems, columnBoundaries);

        const result = {
          fileName,
          type: null,
          date: null,
          user: null,
          fullName: null,
          client: null,
          category: null,
          action: null,
          details: null, // Will be overwritten by merged details
          archive: null,
        };

        for (const headerCol in mappedRow) {
          const mappedKey = headerMap[headerCol];
          const value = mappedRow[headerCol];
          if (mappedKey && value) result[mappedKey] = value;
        }

        return result;
      });

      // Filter valid audit rows (must have at least one identifying field)
      const validRows = cleanedRows.filter((r) => r.type || r.date || r.user);
      if (validRows.length === 0) {
        console.log(`No valid audit data rows found in ${fileName}.`);
        continue;
      }

      // Extract details from the SAME file
      const detailEntries = await extractDetailsOnly(filePath);
      
      console.log(`\n📊 [${fileName}] Audit Entries: ${validRows.length} | Detail Entries: ${detailEntries.length}`);
      if (validRows.length !== detailEntries.length) {
          console.warn(`⚠️ [${fileName}] Entry mismatch! Difference: ${validRows.length - detailEntries.length}. Merging may result in misaligned details.`);
      }


      //  Merge details line-by-line into audits
      // The logic here assumes a 1:1 mapping by sequential order of appearance.
      validRows.forEach((audit, i) => {
        // Overwrite the 'details' field with the corresponding entry
        if (detailEntries[i] && detailEntries[i].details) {
          audit.details = detailEntries[i].details;
        } else {
          // Fallback: If no detail entry exists, ensure 'details' is explicitly null
          audit.details = null;
        }
      });

      // Save merged results
      await AuditLog.insertMany(validRows);
      totalSaved += validRows.length;

      console.log(` Saved ${validRows.length} merged audit logs from ${fileName}`);
    } catch (error) {
      console.error(` Error processing ${fileName}:`, error.message);
    }
  }

  console.log(` Successfully saved ${totalSaved} final merged audit logs`);
};

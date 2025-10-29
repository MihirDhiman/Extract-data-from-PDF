import { extractAllAuditData } from "../services/auditExtracter.js";

export const extractAuditData = async (req, res) => {
  try {
    console.log("Starting extraction from all PDFs...");
    await extractAllAuditData();
    res.status(200).json({
      success: true,
      message: "Data extracted from PDFs and stored in MongoDB successfully.",
    });
  } catch (error) {
    console.error("Error during extraction:", error);
    res.status(500).json({
      success: false,
      message: "Error during PDF extraction and saving.",
      error: error.message,
    });
  }
};

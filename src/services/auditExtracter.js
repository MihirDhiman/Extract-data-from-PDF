import { extractAndSaveAuditData } from "./audit.service.js";

export const extractAllAuditData = async () => {
  console.log("Starting full PDF audit extraction and detail merging...");

  try {
    // extractAndSaveAuditData handles both audit data and detail extraction/merging
    await extractAndSaveAuditData();

    console.log(" All audit data extracted, merged, and saved successfully!");
  } catch (error) {
    console.error(" Error during full audit extraction:", error.message);
  }
};

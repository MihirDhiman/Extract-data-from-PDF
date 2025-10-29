import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getPublicDir = () => {
  return path.join(__dirname, "../../public");
};

const pdfDir = path.join(__dirname, "../../public");

export const getAllPdfFiles = () => {
  if (!fs.existsSync(pdfDir)) {
    throw new Error("Public folder not found");
  }
  const files = fs.readdirSync(pdfDir);
  const pdfFiles = files
    .filter((file) => file.toLowerCase().endsWith(".pdf"))
    .map((file) => path.join(pdfDir, file));

  return pdfFiles;
};

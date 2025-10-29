import express from "express";
import "./src/db/db.js";
import pdfRoutes from "./src/routes/logRoutes.js";
import auditRoutes from "./src/routes/auditRoutes.js";

const app = express();

app.use(express.json());
app.use("/api/logs", pdfRoutes);
app.use("/api/audits", auditRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

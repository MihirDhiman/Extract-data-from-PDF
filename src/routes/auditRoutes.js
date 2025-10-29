import express from "express";
import { extractAuditData  } from "../controllers/auditController.js";

const router = express.Router();
router.get("/extract-reports", extractAuditData );

export default router;

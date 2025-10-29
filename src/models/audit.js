import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true },
    type: { type: String, default: null },
    date: { type: String, default: null },
    user: { type: String, default: null },
    fullName: { type: String, default: null },
    client: { type: String, default: null },
    category: { type: String, default: null },
    action: { type: String, default: null },
    details: { type: String, default: null },
  },
  { versionKey: false }
);

const Audit = mongoose.model("Audit", auditLogSchema);
export default Audit;

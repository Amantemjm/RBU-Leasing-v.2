import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import ownerRoutes from "./routes/ownerRoutes.js";
import tenantRoutes from "./routes/tenantRoutes.js";
import unitRoutes from "./routes/unitRoutes.js";
import { errorHandler } from "./middleware/error.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRoutes);
  app.use("/api/owners", ownerRoutes);
  app.use("/api/tenants", tenantRoutes);
  app.use("/api/units", unitRoutes);
  app.use(errorHandler);
  return app;
}

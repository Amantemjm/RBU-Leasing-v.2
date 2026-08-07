import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/authRoutes.js";
import ownerRoutes from "./routes/ownerRoutes.js";
import tenantRoutes from "./routes/tenantRoutes.js";
import unitRoutes from "./routes/unitRoutes.js";
import leaseRoutes from "./routes/leaseRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import summaryRoutes from "./routes/summaryRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
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
  app.use("/api/leases", leaseRoutes);
  app.use("/api/payments", paymentRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/summary", summaryRoutes);
  app.use("/api/reports", reportRoutes);

  // Production: serve the built Vue client as a single deployable. The API
  // routes above take precedence; any other GET falls back to index.html so
  // client-side routing works. Gated on NODE_ENV so tests are unaffected.
  if (process.env.NODE_ENV === "production") {
    const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
    app.use(express.static(dist));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api")) return next();
      res.sendFile(path.join(dist, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}

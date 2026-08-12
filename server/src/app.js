import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/authRoutes.js";
import ownerRoutes from "./routes/ownerRoutes.js";
import tenantRoutes from "./routes/tenantRoutes.js";
import unitRoutes from "./routes/unitRoutes.js";
import leaseRoutes from "./routes/leaseRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import estateRoutes from "./routes/estateRoutes.js";
import towerRoutes from "./routes/towerRoutes.js";
import requirementRoutes from "./routes/requirementRoutes.js";
import inquiryRoutes from "./routes/inquiryRoutes.js";
import infoSheetRoutes from "./routes/infoSheetRoutes.js";
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
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/estates", estateRoutes);
  app.use("/api/towers", towerRoutes);
  app.use("/api/requirements", requirementRoutes);
  app.use("/api/inquiries", inquiryRoutes);
  app.use("/api/info-sheets", infoSheetRoutes);

  // Production: serve the built Vue client as a single deployable. The API
  // routes above take precedence; any other GET falls back to index.html so
  // client-side routing works. Gated on NODE_ENV so tests are unaffected.
  if (process.env.NODE_ENV === "production") {
    const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
    // Fingerprinted assets may cache indefinitely, but the HTML shell must never
    // be cached — otherwise a browser keeps loading an old build's routing (e.g.
    // landing on the sign-in page instead of the public Inquiry page).
    app.use(express.static(dist, {
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("index.html")) res.setHeader("Cache-Control", "no-store");
      },
    }));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api")) return next();
      res.setHeader("Cache-Control", "no-store");
      res.sendFile(path.join(dist, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}

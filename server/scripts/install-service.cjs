// Installs "RBU Leasing" as an auto-starting Windows Service.
// Run in an ELEVATED (Administrator) terminal:  node scripts/install-service.cjs
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { Service } = require("node-windows");

const name = process.env.RBU_SERVICE_NAME || "RBU Leasing";
const svc = new Service({
  name,
  description: `${name} web app (API + client), single deployable`,
  script: path.join(__dirname, "..", "src", "index.js"),
  // Serve the built Vue client as a single deployable.
  env: [{ name: "NODE_ENV", value: "production" }],
});

svc.on("install", () => {
  console.log("Service installed. Starting…");
  svc.start();
});
svc.on("alreadyinstalled", () => console.log("Service is already installed."));
svc.on("start", () => console.log("RBU Leasing service started on port 4000."));
svc.on("error", (err) => console.error("Service error:", err));

svc.install();

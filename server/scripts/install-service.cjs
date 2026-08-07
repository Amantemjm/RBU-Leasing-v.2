// Installs "RBU Leasing" as an auto-starting Windows Service.
// Run in an ELEVATED (Administrator) terminal:  node scripts/install-service.cjs
const path = require("path");
const { Service } = require("node-windows");

const svc = new Service({
  name: "RBU Leasing",
  description: "RBU Leasing web app (API + client) serving on port 4000",
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

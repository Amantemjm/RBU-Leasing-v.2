// Uninstalls the "RBU Leasing" Windows Service.
// Run in an ELEVATED (Administrator) terminal:  node scripts/uninstall-service.cjs
const path = require("path");
const { Service } = require("node-windows");

const svc = new Service({
  name: "RBU Leasing",
  script: path.join(__dirname, "..", "src", "index.js"),
});

svc.on("uninstall", () => console.log("RBU Leasing service uninstalled."));
svc.on("error", (err) => console.error("Service error:", err));

svc.uninstall();

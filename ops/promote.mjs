// Promote a version through the Dev -> QA -> Prod pipeline.
//   node ops/promote.mjs qa     merges master -> qa,  rebuilds, migrates the QA DB
//   node ops/promote.mjs prod   merges qa -> prod,    rebuilds, migrates the Prod DB
// Each environment is a separate git worktree with its own database, port, and .env.
// Data is NOT copied — promotion moves code + schema migrations only.
import { execSync } from "node:child_process";

const target = (process.argv[2] || "").toLowerCase();
const CFG = {
  qa: { dir: "C:\\Users\\BPM\\Desktop\\RBU-Leasing-QA", from: "master", port: 5060 },
  prod: { dir: "C:\\Users\\BPM\\Desktop\\RBU-Leasing-PROD", from: "qa", port: 5070 },
};
const cfg = CFG[target];
if (!cfg) {
  console.error("Usage: node ops/promote.mjs <qa|prod>");
  process.exit(1);
}

const run = (cmd, cwd) => {
  console.log(`\n> ${cmd}   (in ${cwd})`);
  execSync(cmd, { cwd, stdio: "inherit", shell: true });
};

console.log(`\n=== Promoting ${cfg.from} -> ${target.toUpperCase()} ===`);
run(`git merge ${cfg.from} --no-edit`, cfg.dir);
run(`npm install`, cfg.dir);
run(`npm --workspace client run build`, cfg.dir);
run(`npx prisma migrate deploy`, `${cfg.dir}\\server`);

console.log(`\n${target.toUpperCase()} code + schema are updated.`);
console.log(`Restart it to serve the new version (it runs on port ${cfg.port}):`);
console.log(`  cd "${cfg.dir}\\server" && node src/index.js`);

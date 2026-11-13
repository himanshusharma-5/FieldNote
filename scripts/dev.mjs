import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const children = [
  spawn(process.execPath, [path.join(root, "server", "index.js")], { cwd: root, stdio: "inherit", env: process.env }),
  spawn(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js")], { cwd: root, stdio: "inherit", env: process.env }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  process.exitCode = code;
}
for (const child of children) {
  child.once("error", (error) => { console.error(error); stop(1); });
  child.once("exit", (code) => { if (!stopping) stop(code || 0); });
}
process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));

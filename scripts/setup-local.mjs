import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const targets = [
  {
    source: path.join(root, "apps", "api", ".env.example"),
    target: path.join(root, "apps", "api", ".env"),
  },
  {
    source: path.join(root, "apps", "web", ".env.example"),
    target: path.join(root, "apps", "web", ".env.local"),
  },
];

for (const item of targets) {
  if (!fs.existsSync(item.source)) {
    console.error(`[missing] ${path.relative(root, item.source)}`);
    process.exitCode = 1;
    continue;
  }

  if (fs.existsSync(item.target)) {
    console.log(`[skip] ${path.relative(root, item.target)} already exists`);
    continue;
  }

  fs.copyFileSync(item.source, item.target);
  console.log(`[created] ${path.relative(root, item.target)}`);
}

if (!process.exitCode) {
  console.log("Local env files are ready.");
}

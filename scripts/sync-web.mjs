import { mkdir, rm, copyFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const WEB_OUT = path.join(ROOT, "public");

const FILES = [
  "index.html",
  "app.css",
  "app.js",
  "manifest.webmanifest",
  "sw.js",
  "netlify.toml"
];

async function main() {
  await rm(WEB_OUT, { recursive: true, force: true });
  await mkdir(WEB_OUT, { recursive: true });
  await mkdir(path.join(WEB_OUT, "icons"), { recursive: true });

  for (const f of FILES) {
    await copyFile(path.join(ROOT, f), path.join(WEB_OUT, f));
  }

  await copyFile(path.join(ROOT, "icons", "icon.svg"), path.join(WEB_OUT, "icons", "icon.svg"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


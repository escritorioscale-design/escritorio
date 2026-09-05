import { existsSync, readdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..", "..");
const sourceDir = join(repoRoot, "node_modules", "prisma");
const targetDir = join(scriptDir, "..", "src", "generated");

if (existsSync(sourceDir) && existsSync(targetDir)) {
  for (const file of readdirSync(sourceDir)) {
    if (file.endsWith(".so.node") || file.endsWith(".dll.node")) {
      const dest = join(targetDir, file);
      if (!existsSync(dest)) {
        copyFileSync(join(sourceDir, file), dest);
        console.log(`copy-engine: copied ${file} to src/generated`);
      }
    }
  }
}

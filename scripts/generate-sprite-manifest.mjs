import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const spriteDir = path.join(__dirname, "..", "public", "roulette_interface", "pod-mini-characters");
const manifestPath = path.join(spriteDir, "manifest.json");

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

async function main() {
    const entries = await readdir(spriteDir, { withFileTypes: true });
    const files = entries
        .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
        .map((entry) => entry.name)
        .sort();

    await writeFile(manifestPath, `${JSON.stringify(files, null, 2)}\n`, "utf8");
    console.log(`Wrote ${files.length} sprite filenames to ${manifestPath}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

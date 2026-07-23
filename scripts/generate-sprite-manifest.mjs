import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicRoulette = path.join(__dirname, "..", "public", "roulette_interface");

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

// One manifest per synced icon folder — item sprites (pod-mini-characters, used by {item:ID} tokens/Analytics'
// unused-sprite report) plus the two tag/glossary icon folders (used by IconPathPicker's dropdown, Glossary.tsx),
// so the site can list "what icons actually exist" without a directory-listing API (static host, no backend).
const MANIFEST_DIRS = ["pod-mini-characters", "icons-tags", "icons-tags-fields"];

async function writeManifestFor(dirName) {
    const dir = path.join(publicRoulette, dirName);
    const manifestPath = path.join(dir, "manifest.json");

    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
        if (error.code === "ENOENT") {
            console.warn(`Skipped ${dirName}: folder not synced yet (run the sprite sync first)`);
            return;
        }
        throw error;
    }

    const files = entries
        .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
        .map((entry) => entry.name)
        .sort();

    await writeFile(manifestPath, `${JSON.stringify(files, null, 2)}\n`, "utf8");
    console.log(`Wrote ${files.length} filenames to ${manifestPath}`);
}

async function main() {
    for (const dirName of MANIFEST_DIRS) {
        await writeManifestFor(dirName);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

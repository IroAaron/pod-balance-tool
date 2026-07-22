import { mkdtemp, rm, mkdir, readdir, copyFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const publicDir = path.join(repoRoot, "public");

const REPO_OWNER_SLASH_NAME = "KlukvaGames/preess-or-die";
const BRANCH = "gun2";
const SYNCED_SUBDIR = "roulette_interface";

/** Copies every file matching `extensions` from `sourceDir` into `targetDir` (flat, non-recursive). */
async function copyMatching(sourceDir, targetDir, extensions) {
    await mkdir(targetDir, { recursive: true });
    const entries = await readdir(sourceDir, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
        if (!entry.isFile() || !extensions.has(path.extname(entry.name).toLowerCase())) continue;
        await copyFile(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
        count++;
    }
    return count;
}

/** Strips the embedded access token out of an error's message before it can propagate to logs/the client. */
function redact(error, token) {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(message.split(token).join("***"));
}

/**
 * Local-dev-only sync of the game's sprite/icon assets — same technique deploy.yml already uses in CI (sparse,
 * shallow clone of just `roulette_interface/`), just run on demand from the Sources page's "Подгрузить спрайты"
 * button instead of only at deploy time. `SPRITE_REPO_TOKEN` is read from `process.env` (via `.env.local`,
 * loaded server-side by vite.config.ts) — it must never be prefixed `VITE_`, or Vite would bundle it into the
 * client and leak a private-repo-read token to every visitor of the deployed site.
 */
export async function syncSprites() {
    const token = process.env.SPRITE_REPO_TOKEN;
    if (!token) {
        throw new Error(
            "SPRITE_REPO_TOKEN не задан — добавьте его в .env.local (fine-grained PAT, доступ Contents: Read-only " +
                `к репозиторию ${REPO_OWNER_SLASH_NAME}). См. .env.example.`
        );
    }

    const tmp = await mkdtemp(path.join(tmpdir(), "sprite-sync-"));
    try {
        const cloneUrl = `https://x-access-token:${token}@github.com/${REPO_OWNER_SLASH_NAME}.git`;
        try {
            await execFileAsync("git", [
                "clone",
                "--depth",
                "1",
                "--filter=blob:none",
                "--sparse",
                "--branch",
                BRANCH,
                cloneUrl,
                tmp,
            ]);
            await execFileAsync("git", ["sparse-checkout", "set", SYNCED_SUBDIR], { cwd: tmp });
        } catch (error) {
            throw redact(error, token);
        }

        const sourceRoot = path.join(tmp, SYNCED_SUBDIR);

        // Full mirror, per request — future assets under roulette_interface/ become available locally without
        // this script needing an update every time the game repo adds a new subfolder.
        const mirrorTarget = path.join(publicDir, SYNCED_SUBDIR);
        await rm(mirrorTarget, { recursive: true, force: true });
        await cp(sourceRoot, mirrorTarget, { recursive: true });

        // Also flatten (rename hyphen-case, drop the space) the two subfolders the app's existing sprite/icon
        // resolution expects — see src/core/domain/sprites.ts (SPRITE_BASE_PATH) and descriptionTemplate.ts
        // (TAG_ICON_BASE_PATH) — as siblings of the raw mirror above, both under public/roulette_interface/.
        const spriteCount = await copyMatching(
            path.join(sourceRoot, "pod-mini characters"),
            path.join(mirrorTarget, "pod-mini-characters"),
            new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"])
        );
        const iconCount = await copyMatching(
            path.join(sourceRoot, "Icons_tags"),
            path.join(mirrorTarget, "icons-tags"),
            new Set([".png", ".svg"])
        );

        await execFileAsync("node", [path.join(__dirname, "generate-sprite-manifest.mjs")]);

        return { files: spriteCount + iconCount };
    } finally {
        await rm(tmp, { recursive: true, force: true });
    }
}

import type { Item } from "../models/Item";
import type { GlossaryEntry } from "../models/GlossaryEntry";
import type { TagIcon } from "../models/TagIcon";
import { getItemSpriteFileName } from "./sprites";

/**
 * Turns a raw, site-edited description back into the game's own BBCode shape for export to item_desc — the
 * inverse direction of parseItemDescription's rendering pipeline, but deliberately NOT a mirror of it:
 * {ValueOrRange}/{MoneyValue}/etc. placeholders and any [img]/[color=#...] BBCode the item already had authored
 * are left completely untouched (the game itself resolves those at runtime; baking in today's numbers would be
 * wrong). Only two things get converted into real BBCode/emoji here: `{item:ID}`/`{tag:Name}` tokens (which have
 * no other representation — see descriptionTemplate.ts's applyIconTokens) and glossary phrases, and the glossary
 * pass only touches whichever entries `glossaryToApply` contains — the caller (GameStore.buildExportPayload)
 * filters that list by the site's current descriptionMode + enabled flags first, so the export matches whatever
 * the site itself would currently show, not "all glossary entries unconditionally."
 */
export interface ExportIconContext {
    items: Item[];
    itemIcons: Record<string, string>;
    tagIcons: TagIcon[];
    glossaryToApply: GlossaryEntry[];
    spriteWidthPx: number;
}

const RELATIVE_BASE_TO_RES_PREFIX: Array<{ relativeBase: string; resPrefix: string }> = [
    { relativeBase: "roulette_interface/pod-mini-characters/", resPrefix: "res://roulette_interface/pod-mini characters/" },
    { relativeBase: "roulette_interface/icons-tags/", resPrefix: "res://roulette_interface/Icons_tags/" },
];

/** Inverse of descriptionTemplate.ts's resolveResPath — turns a public/-relative icon path (as stored on a
 *  GlossaryEntry/TagIcon) back into the res:// form the game's own BBCode expects. Undefined if the path isn't
 *  under one of the two synced folders (matches the render side's "unrecognized prefix" philosophy). */
function reconstructResPath(relativePath: string): string | undefined {
    const trimmed = relativePath.replace(/^\/+/, "");
    const match = RELATIVE_BASE_TO_RES_PREFIX.find((entry) => trimmed.startsWith(entry.relativeBase));
    if (!match) return undefined;
    return `${match.resPrefix}${trimmed.slice(match.relativeBase.length)}`;
}

function imgTag(resPath: string, width: number): string {
    return `[img width=${width}]${resPath}[/img]`;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ICON_TOKEN_RE = /\{item:([A-Za-z0-9_]+)\}|\{tag:([^}]+)\}/g;

/** Placeholder marker unlikely to appear in real description prose or in a res:// path/filename, used to shield
 *  freshly-resolved icon BBCode from the glossary phrase pass that runs after it (see buildExportDescriptionText) —
 *  a glossary phrase is natural-language prose, so this only matters for genuinely pathological filenames, but
 *  swapping placeholders in and back out costs nothing and removes the risk entirely rather than trusting it away. */
function iconPlaceholder(index: number): string {
    return ` ICON${index} `;
}

/** Replaces `{item:ID}`/`{tag:Name}` with placeholder markers, returning the placeholder-bearing text plus the
 *  real replacement (BBCode/emoji/unresolved-literal) each marker stands in for — see iconPlaceholder. */
function replaceIconTokensWithPlaceholders(
    text: string,
    context: ExportIconContext
): { text: string; replacements: string[] } {
    const itemsById = new Map(context.items.map((item) => [item.id, item]));
    const tagIconByName = new Map(context.tagIcons.map((entry) => [entry.tag.trim().toLowerCase(), entry]));
    const replacements: string[] = [];

    const withPlaceholders = text.replace(ICON_TOKEN_RE, (fullMatch, itemId: string | undefined, tagName: string | undefined) => {
        let resolved: string;

        if (itemId !== undefined) {
            const refItem = itemsById.get(itemId);
            if (!refItem) {
                resolved = fullMatch;
            } else {
                const manualIcon = context.itemIcons[itemId];
                const spriteFileName = getItemSpriteFileName(refItem);
                if (manualIcon) {
                    resolved = manualIcon;
                } else if (spriteFileName) {
                    resolved = imgTag(`res://roulette_interface/pod-mini characters/${spriteFileName}`, context.spriteWidthPx);
                } else {
                    resolved = "🧩";
                }
            }
        } else if (tagName !== undefined) {
            const entry = tagIconByName.get(tagName.trim().toLowerCase());
            const resPath = entry?.icon ? reconstructResPath(entry.icon) : undefined;
            resolved = resPath ? imgTag(resPath, context.spriteWidthPx) : fullMatch;
        } else {
            resolved = fullMatch;
        }

        const index = replacements.push(resolved) - 1;
        return iconPlaceholder(index);
    });

    return { text: withPlaceholders, replacements };
}

type PhraseMatch = { phrase: string; entry: GlossaryEntry };

function replaceGlossaryPhrases(text: string, glossary: GlossaryEntry[], spriteWidthPx: number): string {
    const usable: PhraseMatch[] = [];
    for (const entry of glossary) {
        if (!entry.icon && !entry.emoji) continue;
        for (const phrase of entry.phrases) {
            if (phrase.trim()) usable.push({ phrase, entry });
        }
    }
    if (usable.length === 0) return text;

    // Longest phrase first, same reasoning as applyGlossary — a more specific phrase should win over a shorter
    // one it happens to contain, including two phrases belonging to the same entry.
    const sorted = [...usable].sort((a, b) => b.phrase.length - a.phrase.length);
    const byPhraseLower = new Map(sorted.map((match) => [match.phrase.toLowerCase(), match]));
    const matchRe = new RegExp(sorted.map((match) => escapeRegExp(match.phrase)).join("|"), "gi");

    return text.replace(matchRe, (matchedText) => {
        const { entry } = byPhraseLower.get(matchedText.toLowerCase())!;
        if (entry.icon) {
            const resPath = reconstructResPath(entry.icon);
            return resPath ? imgTag(resPath, spriteWidthPx) : matchedText;
        }
        return entry.emoji!;
    });
}

const ICON_PLACEHOLDER_RE = / ICON(\d+) /g;

/** Item/tag tokens convert first (deterministic direct references, held behind placeholders so the glossary pass
 *  below can never match text inside their own resolved BBCode/filename), then whatever plain text remains gets
 *  scanned for glossary phrases, then the placeholders are swapped back for their real resolved values. Anything
 *  else in the raw text ({ValueOrRange}, existing [img]/[color] tags, plain prose) passes through unchanged. */
export function buildExportDescriptionText(rawText: string, context: ExportIconContext): string {
    const { text: withPlaceholders, replacements } = replaceIconTokensWithPlaceholders(rawText, context);
    const withGlossary = replaceGlossaryPhrases(withPlaceholders, context.glossaryToApply, context.spriteWidthPx);
    return withGlossary.replace(ICON_PLACEHOLDER_RE, (_match, indexStr: string) => replacements[Number(indexStr)]);
}

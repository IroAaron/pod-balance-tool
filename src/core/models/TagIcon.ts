/**
 * A manually-curated "tag name -> icon" mapping, used to resolve `{tag:Name}` tokens inserted into item
 * descriptions (see descriptionTemplate.ts) into a real icon without the editor needing to know or type a
 * `res://`/public path. Unlike item icons (which reuse the real Items list directly — every item already has
 * its own sprite/manual-icon), tags have no existing icon source anywhere in the app, so this is a small new
 * curated list, edited on the Glossary page's "Иконки тегов" tab.
 */
export interface TagIcon {
    id: string;

    /** Matched case-insensitively against a `{tag:Name}` token and against Item.tags when offering insert suggestions. */
    tag: string;

    /** Relative path under public/ (e.g. "roulette_interface/icons-tags/foo.svg") — same convention as GlossaryEntry.icon. */
    icon: string;

    /** Shown as a tooltip when hovering the icon a {tag:Name} token resolves to inside a rendered description
     *  (see descriptionTemplate.ts's applyIconTokens). Same idea as GlossaryEntry.note. */
    note?: string;
}

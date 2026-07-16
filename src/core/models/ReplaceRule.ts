export type ReplaceRuleSource = "ReplaceItem" | "ReplaceOnTrigger";

export interface ReplaceRule {
    id: string;

    source: ReplaceRuleSource;

    itemIdToReplace: string;

    replacementItem: string;

    fields: Record<string, string>;
}

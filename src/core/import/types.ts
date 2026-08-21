export interface ParsedTable {
    sourceName: string;

    headers: string[];

    rows: Record<string, string>[];

    /**
     * True when the source cannot represent two columns with the same header, so any repeat collapsed into one
     * before we ever saw it.
     *
     * The real sheet leans on repeated headers in three places — Sprints' nine `RoundSettings` columns,
     * BallGroups' seven `Ball` columns and RoundSettings' own `DeckBalls` columns — and CSV keeps them (Papa
     * renames the repeats to `Ball_1`, `Ball_2`, ...), but the Apps Script endpoint serialises each row as a
     * JSON object, where a duplicate key simply overwrites the previous one. Reading such a table is lossy, and
     * writing it back would blank the columns that never arrived, so the exports refuse to touch them.
     */
    duplicateHeadersCollapsed?: boolean;
}

export interface Round {
    id: string;

    /** Short internal rule/mode name (e.g. "Marathon", "Monochrome") — often blank for rounds that exist purely to
     *  carry an AdditionalInvisibleArtefact. Not guaranteed to be user-facing; the real display name is whatever
     *  translation resolves for `id` itself. */
    rules?: string;

    /** An Item id (in_a_* invisible artifact) this round attaches. */
    invisibleArtefactId?: string;

    /** TempDeck column — this round's own deck from "Колоды магазина" (DecksShop), a Deck id. */
    tempDeckId?: string;

    /** DeckBalls* columns, blanks filtered, order preserved — BallGroup id references, up to 10 real slots. */
    deckBalls: string[];

    descKey: string;

    /** Full source row — covers TempDeck and anything else not modeled above. */
    raw: Record<string, string>;
}

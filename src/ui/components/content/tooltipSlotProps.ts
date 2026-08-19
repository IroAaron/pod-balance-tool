/** Matches the site-wide "Размер текста тултипов" setting (Настройки) so lab tooltips read at the same size as everywhere else. */
export function tooltipFontSizeSlotProps(tooltipFontSizePx: number) {
    return { tooltip: { sx: { fontSize: tooltipFontSizePx } } } as const;
}

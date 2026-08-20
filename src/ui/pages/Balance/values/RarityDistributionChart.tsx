import { useMemo } from "react";
import { Box, Stack, Tooltip, Typography, useTheme } from "@mui/material";
import type { RarityStats } from "../../../../core/domain/rarityBalance";

interface Props {
    title: string;
    stats: RarityStats[];
    /** Rarities the trend check complained about — drawn in the warning colour. */
    flaggedRarities: Set<string>;
    height?: number;
}

const CHART_WIDTH = 560;
const PADDING = { top: 12, right: 12, bottom: 26, left: 44 };

/** Deterministic spread for the dots, so a column of identical values reads as a cluster instead of one dot,
 *  and so the picture doesn't jitter on every re-render the way Math.random() would make it. */
function offsetFor(index: number, count: number): number {
    if (count <= 1) return 0;
    // Alternating outward from the centre: 0, +1, -1, +2, -2, ...
    const step = Math.ceil(index / 2) * (index % 2 === 0 ? -1 : 1);
    return step;
}

function niceTicks(low: number, high: number): number[] {
    if (low === high) return [low];
    const rawStep = (high - low) / 4;
    const magnitude = 10 ** Math.floor(Math.log10(Math.abs(rawStep) || 1));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= rawStep) ?? magnitude * 10;
    const first = Math.ceil(low / step) * step;
    const ticks: number[] = [];
    for (let tick = first; tick <= high + step / 1000; tick += step) ticks.push(Number(tick.toFixed(6)));
    return ticks;
}

/**
 * One column per rarity: a p25–p75 box with a median line, whiskers out to min/max, and every item's own value
 * as a dot. The box is the point of the whole thing — two rarities whose boxes sit at the same height are two
 * rarities a player can't tell apart, which a bar of averages would hide completely.
 *
 * Hand-drawn SVG rather than a chart library: four columns and a handful of line segments don't justify the
 * dependency, and this way the colours come straight from the MUI theme in both light and dark mode.
 */
export default function RarityDistributionChart({ title, stats, flaggedRarities, height = 210 }: Props) {
    const theme = useTheme();

    const withValues = useMemo(() => stats.filter((entry) => entry.values.length > 0), [stats]);

    const { low, high } = useMemo(() => {
        const all = withValues.flatMap((entry) => entry.values);
        if (!all.length) return { low: 0, high: 1 };
        const rawLow = Math.min(...all, 0);
        const rawHigh = Math.max(...all, 0);
        if (rawLow === rawHigh) return { low: rawLow - 1, high: rawHigh + 1 };
        const margin = (rawHigh - rawLow) * 0.08;
        return { low: rawLow - margin, high: rawHigh + margin };
    }, [withValues]);

    if (!withValues.length) {
        return (
            <Box>
                <Typography variant="subtitle2">{title}</Typography>
                <Typography variant="caption" color="text.secondary">
                    Нет заполненных значений в текущей выборке.
                </Typography>
            </Box>
        );
    }

    const plotHeight = height - PADDING.top - PADDING.bottom;
    const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
    const columnWidth = plotWidth / withValues.length;
    const boxWidth = Math.min(46, columnWidth * 0.5);

    const y = (value: number) => PADDING.top + plotHeight - ((value - low) / (high - low)) * plotHeight;
    const centerX = (index: number) => PADDING.left + columnWidth * (index + 0.5);

    const gridColor = theme.palette.divider;
    const axisText = theme.palette.text.secondary;

    return (
        <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                {title}
            </Typography>
            <Box
                component="svg"
                viewBox={`0 0 ${CHART_WIDTH} ${height}`}
                sx={{ width: "100%", height: "auto", maxWidth: CHART_WIDTH, display: "block", overflow: "visible" }}
                role="img"
                aria-label={`Разброс ${title} по редкостям`}
            >
                {niceTicks(low, high).map((tick) => (
                    <g key={tick}>
                        <line x1={PADDING.left} x2={CHART_WIDTH - PADDING.right} y1={y(tick)} y2={y(tick)} stroke={gridColor} strokeWidth={1} />
                        <text x={PADDING.left - 6} y={y(tick) + 3.5} textAnchor="end" fontSize={10} fill={axisText}>
                            {tick}
                        </text>
                    </g>
                ))}

                {/* Zero is worth its own darker line: several of these columns go negative. */}
                {low < 0 && high > 0 && (
                    <line
                        x1={PADDING.left}
                        x2={CHART_WIDTH - PADDING.right}
                        y1={y(0)}
                        y2={y(0)}
                        stroke={axisText}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                    />
                )}

                {withValues.map((entry, index) => {
                    const flagged = flaggedRarities.has(entry.rarity);
                    const color = flagged ? theme.palette.warning.main : theme.palette.primary.main;
                    const x = centerX(index);

                    return (
                        <g key={entry.rarity}>
                            <line x1={x} x2={x} y1={y(entry.max)} y2={y(entry.min)} stroke={color} strokeWidth={1} opacity={0.55} />
                            <line x1={x - boxWidth / 4} x2={x + boxWidth / 4} y1={y(entry.max)} y2={y(entry.max)} stroke={color} strokeWidth={1} opacity={0.55} />
                            <line x1={x - boxWidth / 4} x2={x + boxWidth / 4} y1={y(entry.min)} y2={y(entry.min)} stroke={color} strokeWidth={1} opacity={0.55} />

                            <rect
                                x={x - boxWidth / 2}
                                y={Math.min(y(entry.p75), y(entry.p25))}
                                width={boxWidth}
                                height={Math.max(2, Math.abs(y(entry.p25) - y(entry.p75)))}
                                fill={color}
                                fillOpacity={0.16}
                                stroke={color}
                                strokeWidth={1}
                            />
                            <line x1={x - boxWidth / 2} x2={x + boxWidth / 2} y1={y(entry.median)} y2={y(entry.median)} stroke={color} strokeWidth={2.5} />

                            {entry.values.map((value, valueIndex) => (
                                <circle
                                    key={`${value}-${valueIndex}`}
                                    cx={x + offsetFor(valueIndex, entry.values.length) * 3.2}
                                    cy={y(value)}
                                    r={2}
                                    fill={color}
                                    fillOpacity={0.5}
                                />
                            ))}

                            <text x={x} y={height - 9} textAnchor="middle" fontSize={11} fill={flagged ? theme.palette.warning.main : axisText}>
                                {entry.rarity}
                            </text>
                        </g>
                    );
                })}
            </Box>

            <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", mt: 0.5 }}>
                {withValues.map((entry) => (
                    <Tooltip
                        key={entry.rarity}
                        title={`min ${entry.min} · p25 ${entry.p25} · медиана ${entry.median} · p75 ${entry.p75} · max ${entry.max} · среднее ${entry.mean.toFixed(1)}`}
                    >
                        <Typography variant="caption" color="text.secondary" sx={{ cursor: "help" }}>
                            <b>{entry.rarity}</b> мед. {entry.median} ({entry.values.length}
                            {entry.values.length !== entry.itemCount ? ` из ${entry.itemCount}` : ""})
                        </Typography>
                    </Tooltip>
                ))}
            </Stack>
        </Box>
    );
}

import { useEffect, useState } from "react";
import { Alert, Box, Stack, Typography } from "@mui/material";
import { useStore } from "../../hooks/useStore";
import { getItemSpriteFileName, SPRITE_BASE_PATH } from "../../../core/domain/sprites";

export default function AnalyticsPage() {
    const store = useStore();
    const [manifest, setManifest] = useState<string[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        fetch(`${SPRITE_BASE_PATH}manifest.json`)
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json() as Promise<string[]>;
            })
            .then((files) => {
                if (!cancelled) setManifest(files);
            })
            .catch((fetchError) => {
                if (!cancelled) setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const usedSpriteNames = new Set(
        store.allItems.map((item) => getItemSpriteFileName(item)).filter((name): name is string => Boolean(name))
    );

    const unusedSprites = (manifest ?? []).filter((file) => !usedSpriteNames.has(file));

    return (
        <Stack spacing={3}>
            <Typography variant="h4">Аналитика</Typography>

            <Stack spacing={0.5}>
                <Typography variant="h6">Неиспользуемые спрайты</Typography>
                <Typography variant="body2" color="text.secondary">
                    Файлы из public/pod-mini-characters, на которые не ссылается ни один загруженный предмет
                    (колонка CardSpriteNameMini).
                </Typography>
            </Stack>

            {error && <Alert severity="error">Не удалось загрузить список спрайтов: {error}</Alert>}

            {manifest && (
                <Typography variant="body2" color="text.secondary">
                    Неиспользуемых: {unusedSprites.length} из {manifest.length}
                </Typography>
            )}

            {manifest && unusedSprites.length === 0 && (
                <Typography color="text.secondary">Неиспользуемых спрайтов не найдено.</Typography>
            )}

            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                    gap: 2,
                }}
            >
                {unusedSprites.map((file) => (
                    <Stack key={file} spacing={0.5} sx={{ alignItems: "center" }}>
                        <img
                            src={`${SPRITE_BASE_PATH}${encodeURIComponent(file)}`}
                            alt={file}
                            width={64}
                            height={64}
                            style={{ objectFit: "contain" }}
                        />
                        <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ textAlign: "center", wordBreak: "break-all" }}
                        >
                            {file}
                        </Typography>
                    </Stack>
                ))}
            </Box>
        </Stack>
    );
}

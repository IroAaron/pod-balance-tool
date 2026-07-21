import { Routes, Route, Navigate, useParams, Link as RouterLink } from "react-router-dom";
import { Button, Stack, Typography } from "@mui/material";

import SourcesPage from "../pages/Sources/SourcesPage";
import ItemsPage from "../pages/Items/ItemsPage";
import ItemDetailPage from "../pages/Items/ItemDetailPage";
import BuildsPage from "../pages/Builds/BuildsPage";
import BuildDetailPage from "../pages/Builds/BuildDetailPage";
import GlossaryPage from "../pages/Glossary/GlossaryPage";
import GraphPage from "../pages/Graph/GraphPage";
import AnalyticsPage from "../pages/Analytics/AnalyticsPage";
import SettingsPage from "../pages/Settings/SettingsPage";

// Keyed by :id so navigating between two detail pages of the same route
// fully remounts the component instead of leaking stale local edit state.
function ItemDetailRoute() {
    const { id } = useParams();
    return <ItemDetailPage key={id} />;
}

function BuildDetailRoute() {
    const { id } = useParams();
    return <BuildDetailPage key={id} />;
}

function NotFoundPage() {
    return (
        <Stack spacing={2}>
            <Typography variant="h5">Страница не найдена</Typography>
            <Button component={RouterLink} to="/items" sx={{ alignSelf: "flex-start" }}>
                ← К списку предметов
            </Button>
        </Stack>
    );
}

export default function AppRouter() {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/sources" replace />} />

            <Route path="/sources" element={<SourcesPage />} />
            <Route path="/items" element={<ItemsPage />} />
            <Route path="/items/:id" element={<ItemDetailRoute />} />
            <Route path="/builds" element={<BuildsPage />} />
            <Route path="/builds/:id" element={<BuildDetailRoute />} />
            <Route path="/glossary" element={<GlossaryPage />} />
            <Route path="/graph" element={<GraphPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
}
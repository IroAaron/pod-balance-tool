import { Routes, Route, Navigate, useParams, Link as RouterLink } from "react-router-dom";
import { Button, Stack, Typography } from "@mui/material";

import SourcesPage from "../pages/Sources/SourcesPage";
import ItemsPage from "../pages/Items/ItemsPage";
import ItemDetailPage from "../pages/Items/ItemDetailPage";
import RoundsPage from "../pages/Rounds/RoundsPage";
import RoundDetailPage from "../pages/Rounds/RoundDetailPage";
import DecksPage from "../pages/Decks/DecksPage";
import PacksPage from "../pages/Packs/PacksPage";
import PackDetailPage from "../pages/Packs/PackDetailPage";
import BallsPage from "../pages/Balls/BallsPage";
import BallDetailPage from "../pages/Balls/BallDetailPage";
import SprintsPage from "../pages/Sprints/SprintsPage";
import SprintDetailPage from "../pages/Sprints/SprintDetailPage";
import BuildsPage from "../pages/Builds/BuildsPage";
import BuildDetailPage from "../pages/Builds/BuildDetailPage";
import GlossaryPage from "../pages/Glossary/GlossaryPage";
import GraphPage from "../pages/Graph/GraphPage";
import AutotestsPage from "../pages/Autotests/AutotestsPage";
import AnalyticsPage from "../pages/Analytics/AnalyticsPage";
import BalancePage from "../pages/Balance/BalancePage";
import SettingsPage from "../pages/Settings/SettingsPage";
import BlueprintLabPage from "../pages/BlueprintLab/BlueprintLabPage";
import SavesPage from "../pages/Saves/SavesPage";

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

function RoundDetailRoute() {
    const { id } = useParams();
    return <RoundDetailPage key={id} />;
}

function PackDetailRoute() {
    const { id } = useParams();
    return <PackDetailPage key={id} />;
}

function BallDetailRoute() {
    const { id } = useParams();
    return <BallDetailPage key={id} />;
}

function SprintDetailRoute() {
    const { id } = useParams();
    return <SprintDetailPage key={id} />;
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
            <Route path="/rounds" element={<RoundsPage />} />
            <Route path="/rounds/:id" element={<RoundDetailRoute />} />
            <Route path="/decks" element={<DecksPage />} />
            <Route path="/packs" element={<PacksPage />} />
            <Route path="/packs/:id" element={<PackDetailRoute />} />
            <Route path="/balls" element={<BallsPage />} />
            <Route path="/balls/:id" element={<BallDetailRoute />} />
            <Route path="/sprints" element={<SprintsPage />} />
            <Route path="/sprints/:id" element={<SprintDetailRoute />} />
            <Route path="/builds" element={<BuildsPage />} />
            <Route path="/builds/:id" element={<BuildDetailRoute />} />
            <Route path="/glossary" element={<GlossaryPage />} />
            <Route path="/graph" element={<GraphPage />} />
            <Route path="/balance" element={<BalancePage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/autotests" element={<AutotestsPage />} />
            <Route path="/saves" element={<SavesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/blueprint-lab" element={<BlueprintLabPage />} />
            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
}
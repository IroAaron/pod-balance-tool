import { Routes, Route, Navigate, useParams } from "react-router-dom";

import SourcesPage from "../pages/Sources/SourcesPage";
import ItemsPage from "../pages/Items/ItemsPage";
import ItemDetailPage from "../pages/Items/ItemDetailPage";
import BuildsPage from "../pages/Builds/BuildsPage";
import BuildDetailPage from "../pages/Builds/BuildDetailPage";
import GraphPage from "../pages/Graph/GraphPage";
import AnalyticsPage from "../pages/Analytics/AnalyticsPage";

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

export default function AppRouter() {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/sources" replace />} />

            <Route path="/sources" element={<SourcesPage />} />
            <Route path="/items" element={<ItemsPage />} />
            <Route path="/items/:id" element={<ItemDetailRoute />} />
            <Route path="/builds" element={<BuildsPage />} />
            <Route path="/builds/:id" element={<BuildDetailRoute />} />
            <Route path="/graph" element={<GraphPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
        </Routes>
    );
}
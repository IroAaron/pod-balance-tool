import { Routes, Route, Navigate } from "react-router-dom";

import SourcesPage from "../pages/Sources/SourcesPage";
import ItemsPage from "../pages/Items/ItemsPage";
import BuildsPage from "../pages/Builds/BuildsPage";
import GraphPage from "../pages/Graph/GraphPage";
import AnalyticsPage from "../pages/Analytics/AnalyticsPage";

export default function AppRouter() {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/sources" replace />} />

            <Route path="/sources" element={<SourcesPage />} />
            <Route path="/items" element={<ItemsPage />} />
            <Route path="/builds" element={<BuildsPage />} />
            <Route path="/graph" element={<GraphPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
        </Routes>
    );
}
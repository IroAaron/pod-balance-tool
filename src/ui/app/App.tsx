import { useLocation } from "react-router-dom";
import MainLayout from "../layout/MainLayout";
import AppRouter from "./Router";
import ErrorBoundary from "./ErrorBoundary";

export default function App() {
    const location = useLocation();

    return (
        <MainLayout>
            {/* Keyed by path so navigating away from a crashed page clears the error automatically. */}
            <ErrorBoundary key={location.pathname}>
                <AppRouter />
            </ErrorBoundary>
        </MainLayout>
    );
}
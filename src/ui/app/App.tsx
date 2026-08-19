import { useLocation } from "react-router-dom";
import MainLayout from "../layout/MainLayout";
import AppRouter from "./Router";
import ErrorBoundary from "./ErrorBoundary";
import { EnumRegistryProvider } from "../components/content/EnumRegistryContext";

export default function App() {
    const location = useLocation();

    return (
        // The enum registry backs every content-editing dropdown (item params, mechanic fields), so it wraps the
        // whole app rather than one page — any section that edits config data reads its allowed values from here.
        <EnumRegistryProvider>
            <MainLayout>
                {/* Keyed by path so navigating away from a crashed page clears the error automatically. */}
                <ErrorBoundary key={location.pathname}>
                    <AppRouter />
                </ErrorBoundary>
            </MainLayout>
        </EnumRegistryProvider>
    );
}

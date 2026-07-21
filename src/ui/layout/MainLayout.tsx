import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Box } from "@mui/material";
import Sidebar from "./Sidebar";

type Props = {
    children: React.ReactNode;
};

export default function MainLayout({ children }: Props) {
    const location = useLocation();
    const scrollRef = useRef<HTMLDivElement>(null);

    // The content pane keeps its own scroll position across route changes (it's never remounted) — without this,
    // navigating into a detail page while scrolled down on a list page opens the new page already scrolled down.
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: 0 });
    }, [location.pathname]);

    return (
        <Box
            sx={{
                display: "flex",
                height: "100vh",
            }}
        >
            <Sidebar />

            <Box
                ref={scrollRef}
                sx={{
                    flex: 1,
                    p: 3,
                    overflowY: "auto",
                    minWidth: 0,
                }}
            >
                {children}
            </Box>
        </Box>
    );
}
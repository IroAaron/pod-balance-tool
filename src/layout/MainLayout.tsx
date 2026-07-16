import { Box } from "@mui/material";
import Sidebar from "./Sidebar";

type Props = {
    children: React.ReactNode;
};

export default function MainLayout({ children }: Props) {
    return (
        <Box
            sx={{
                display: "flex",
                height: "100vh",
            }}
        >
            <Sidebar />

            <Box
                sx={{
                    flex: 1,
                    p: 3,
                }}
            >
                {children}
            </Box>
        </Box>
    );
}
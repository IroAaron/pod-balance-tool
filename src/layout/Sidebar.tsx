import { Box, Typography } from "@mui/material";

export default function Sidebar() {
    return (
        <Box
            sx={{
                width: 260,
                borderRight: "1px solid #ddd",
                p: 2,
            }}
        >
            <Typography variant="h5">
                🧩 Balance Tool
            </Typography>
        </Box>
    );
}
import { Box, List, Typography } from "@mui/material";
import NavigationItem from "../components/NavigationItem";
import { menu } from "../components/NavigationMenu";

export default function Sidebar() {
    return (
        <Box
            sx={{
                width: 260,
                flexShrink: 0,
                borderRight: "1px solid",
                borderColor: "divider",
                p: 2,
                display: "flex",
                flexDirection: "column",
            }}
        >
            <Typography variant="h5" sx={{ mb: 2, px: 1 }}>
                🧩 Balance Tool
            </Typography>

            <List sx={{ flex: 1 }}>
                {menu.map((item) => (
                    <NavigationItem key={item.path} item={item} />
                ))}
            </List>
        </Box>
    );
}

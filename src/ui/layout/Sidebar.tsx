import { Box, List, Typography } from "@mui/material";
import NavigationItem from "../components/NavigationItem";
import NavigationGroup from "../components/NavigationGroup";
import { isNavigationMenuGroup, menu } from "../components/NavigationMenu";

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
                {menu.map((entry) =>
                    isNavigationMenuGroup(entry) ? (
                        <NavigationGroup key={entry.text} group={entry} />
                    ) : (
                        <NavigationItem key={entry.path} item={entry} />
                    )
                )}
            </List>
        </Box>
    );
}

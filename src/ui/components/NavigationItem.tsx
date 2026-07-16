import { NavLink } from "react-router-dom";
import { ListItemButton, ListItemIcon, ListItemText } from "@mui/material";
import type { NavigationMenuItem } from "./NavigationMenu";

type Props = {
    item: NavigationMenuItem;
};

export default function NavigationItem({ item }: Props) {
    return (
        <ListItemButton
            component={NavLink}
            to={item.path}
            sx={{
                borderRadius: 1,
                mb: 0.5,
                "&.active": {
                    bgcolor: "action.selected",
                },
            }}
        >
            <ListItemIcon sx={{ minWidth: 36, fontSize: 20 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.text} />
        </ListItemButton>
    );
}

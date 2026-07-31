import { useState } from "react";
import { Collapse, List, ListItemButton, ListItemIcon, ListItemText } from "@mui/material";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import NavigationItem from "./NavigationItem";
import type { NavigationMenuGroup as NavigationMenuGroupType } from "./NavigationMenu";

type Props = {
    group: NavigationMenuGroupType;
};

export default function NavigationGroup({ group }: Props) {
    const [open, setOpen] = useState(true);

    return (
        <>
            <ListItemButton onClick={() => setOpen((prev) => !prev)} sx={{ borderRadius: 1, mb: 0.5 }}>
                <ListItemIcon sx={{ minWidth: 36, fontSize: 20 }}>{group.icon}</ListItemIcon>
                <ListItemText primary={group.text} />
                {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </ListItemButton>
            <Collapse in={open} timeout="auto" unmountOnExit>
                <List component="div" disablePadding sx={{ pl: 2 }}>
                    {group.children.map((child) => (
                        <NavigationItem key={child.path} item={child} />
                    ))}
                </List>
            </Collapse>
        </>
    );
}

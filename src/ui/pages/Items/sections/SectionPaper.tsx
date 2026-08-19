import type { ReactNode } from "react";
import { Paper, Stack, Typography } from "@mui/material";

interface Props {
    title: string;

    /** Sits on the same line as the title, right-aligned — copy buttons, "add" actions, counters. */
    actions?: ReactNode;

    children: ReactNode;
}

/** One card section of the item page, so every section lines up the same way. */
export default function SectionPaper({ title, actions, children }: Props) {
    return (
        <Paper sx={{ p: 3 }}>
            <Stack
                direction="row"
                spacing={1}
                sx={{ mb: 2, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}
            >
                <Typography variant="h6">{title}</Typography>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}>
                    {actions}
                </Stack>
            </Stack>
            {children}
        </Paper>
    );
}

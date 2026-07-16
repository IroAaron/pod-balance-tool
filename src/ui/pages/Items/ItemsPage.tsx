import { Typography } from "@mui/material";
import { useStore } from "../../hooks/useStore";

export default function ItemsPage() {

    const store = useStore();

    return (
        <>
            <Typography variant="h4">
                Предметы
            </Typography>

            <Typography>
                Items loaded: {store.items.length}
            </Typography>
        </>
    );
}
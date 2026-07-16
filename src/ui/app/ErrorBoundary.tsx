import { Component, type ReactNode } from "react";
import { Alert, AlertTitle, Box, Button, Typography } from "@mui/material";

type Props = {
    children: ReactNode;
};

type State = {
    error: Error | null;
};

export default class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error) {
        console.error("Uncaught render error:", error);
    }

    render() {
        const { error } = this.state;

        if (!error) return this.props.children;

        return (
            <Box sx={{ p: 4, maxWidth: 800 }}>
                <Alert severity="error">
                    <AlertTitle>Ошибка при отображении страницы</AlertTitle>
                    <Typography variant="body2" sx={{ mb: 1, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                        {error.message}
                    </Typography>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => this.setState({ error: null })}
                    >
                        Попробовать снова
                    </Button>
                </Alert>
            </Box>
        );
    }
}

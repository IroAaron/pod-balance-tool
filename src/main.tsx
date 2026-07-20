import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";

import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

import App from "./ui/app/App";
import theme from "./ui/theme/theme";
import { StoreProvider } from "./ui/providers/StoreProvider";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <ThemeProvider theme={theme}>
            <CssBaseline />

            <StoreProvider>
                <HashRouter>
                    <App />
                </HashRouter>
            </StoreProvider>
        </ThemeProvider>
    </React.StrictMode>
);
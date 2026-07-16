import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

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
                <BrowserRouter>
                    <App />
                </BrowserRouter>
            </StoreProvider>
        </ThemeProvider>
    </React.StrictMode>
);
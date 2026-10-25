import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@heavy-rain/organization-ui/styles.css";
import "./styles.css";
import { App } from "./App.tsx";
import { MassBalanceApp } from "./MassBalanceApp.tsx";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Missing #root container for AUGI Sable workbench");
}

/** `?app=balance` opens the mass and center-of-gravity ledger; everything else opens the chassis study. */
const requestedApp = new URLSearchParams(window.location.search).get("app");

createRoot(container).render(
  <StrictMode>
    {requestedApp === "balance" ? <MassBalanceApp /> : <App />}
  </StrictMode>
);

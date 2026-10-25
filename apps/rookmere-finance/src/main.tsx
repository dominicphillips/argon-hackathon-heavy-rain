import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@heavy-rain/organization-ui";
import "./styles/app.css";
import { App } from "./App";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Missing #root container in apps/rookmere-finance/index.html");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

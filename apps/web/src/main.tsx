import React from "react";
import ReactDOM from "react-dom/client";
import { AuthKitProvider } from "@workos-inc/authkit-react";
import { App } from "./App";
import "./styles.css";

const WORKOS_CLIENT_ID = String((import.meta as any).env?.VITE_WORKOS_CLIENT_ID || "").trim();
const WORKOS_API_HOSTNAME = String((import.meta as any).env?.VITE_WORKOS_API_HOSTNAME || "").trim() || undefined;
const WORKOS_REDIRECT_URI = String((import.meta as any).env?.VITE_WORKOS_REDIRECT_URI || "").trim() || undefined;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {WORKOS_CLIENT_ID ? (
      <AuthKitProvider
        clientId={WORKOS_CLIENT_ID}
        apiHostname={WORKOS_API_HOSTNAME}
        redirectUri={WORKOS_REDIRECT_URI || `${window.location.origin}/callback`}
      >
        <App />
      </AuthKitProvider>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);

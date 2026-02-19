export const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://localhost:8788";
export const AUTH_TOKEN_STORAGE_KEY = "clawpad.apiAuthToken";
export const AUTH_TOKEN_ENV = String((import.meta as any).env?.VITE_AUTH_TOKEN || "").trim();
export const WORKOS_CLIENT_ID = String((import.meta as any).env?.VITE_WORKOS_CLIENT_ID || "").trim();
export const WORKOS_ENABLED = Boolean(WORKOS_CLIENT_ID);

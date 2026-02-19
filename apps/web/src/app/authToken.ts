import { AUTH_TOKEN_ENV, AUTH_TOKEN_STORAGE_KEY } from "./env";
import type { ApiAuthTokenResolver } from "./types";

export function initialApiAuthToken(): string {
  if (typeof window === "undefined") return AUTH_TOKEN_ENV;
  try {
    return (
      window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)?.trim() ||
      window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)?.trim() ||
      AUTH_TOKEN_ENV
    );
  } catch {
    return AUTH_TOKEN_ENV;
  }
}

export function persistApiAuthToken(token: string): string {
  const trimmed = token.trim();
  try {
    if (trimmed) {
      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, trimmed);
    } else {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
  } catch {
    // no-op: persistence is opportunistic in environments that don't allow storage access
  }
  return trimmed;
}

export function buildApiHeaders(apiAuthToken: string, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const token = apiAuthToken.trim();
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function buildApiHeadersFromResolver(
  getApiAuthToken: ApiAuthTokenResolver,
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const apiAuthToken = await getApiAuthToken();
  return buildApiHeaders(apiAuthToken, extra);
}

export function shortToken(token: string): string {
  const normalized = token.trim();
  if (!normalized) return "none";
  if (normalized.length <= 10) return normalized;
  return `••••${normalized.slice(-6)}`;
}

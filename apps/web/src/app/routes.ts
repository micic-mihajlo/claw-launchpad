import type { AppRoute } from "./types";

export function readInitialRoute(): AppRoute {
  if (typeof window === "undefined") {
    return "overview";
  }
  const pathname = (window.location.pathname || "/").toLowerCase();
  if (pathname.startsWith("/app/deployments") || pathname.startsWith("/deployments")) return "deployments";
  if (pathname.startsWith("/app/billing") || pathname.startsWith("/billing") || pathname.startsWith("/orders")) return "billing";
  return "overview";
}

export function routePath(route: AppRoute): string {
  if (route === "deployments") return "/app/deployments";
  if (route === "billing") return "/app/billing";
  return "/app";
}

export function isAppPath(pathname: string): boolean {
  const normalized = pathname.toLowerCase();
  return (
    normalized.startsWith("/app") ||
    normalized.startsWith("/deployments") ||
    normalized.startsWith("/billing") ||
    normalized.startsWith("/orders") ||
    normalized.startsWith("/callback")
  );
}

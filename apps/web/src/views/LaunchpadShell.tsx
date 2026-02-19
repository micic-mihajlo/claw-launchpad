import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseApiResponse } from "../app/api";
import { buildApiHeadersFromResolver, initialApiAuthToken, persistApiAuthToken, shortToken } from "../app/authToken";
import { AUTH_TOKEN_ENV, API_BASE } from "../app/env";
import { readInitialRoute, routePath } from "../app/routes";
import type {
  ApiAuthTokenResolver,
  AppRoute,
  BillingOrderRecord,
  DeploymentRecord,
  LoadState,
  ShellAuthConfig,
} from "../app/types";
import { AuthModal } from "../components/AuthModal";
import { DiscordConnector } from "../components/DiscordConnector";
import { BillingRoute } from "./shell/BillingRoute";
import { DeploymentsRoute } from "./shell/DeploymentsRoute";
import { ProtectedRoute } from "./shell/ProtectedRoute";
import { OverviewRoute } from "./shell/OverviewRoute";
import { ShellHeader } from "./shell/ShellHeader";
import { ShellTabs } from "./shell/ShellTabs";

const statusMessages = {
  loading: "Loading latest state…",
  idle: "Ready to fetch",
  ready: "Ready",
  error: "Request failed",
};

export function LaunchpadShell(props: { auth: ShellAuthConfig }) {
  const { resolveSessionToken, userLabel, workosEnabled, hasSession, onSignInCta, signInCtaDisabled } = props.auth;

  const [route, setRoute] = useState<AppRoute>(readInitialRoute);
  const [discordOpen, setDiscordOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [apiAuthToken, setApiAuthToken] = useState(initialApiAuthToken);

  const [deployments, setDeployments] = useState<LoadState<DeploymentRecord[]>>({
    status: "idle",
    data: [],
    error: null,
    loadedAt: null,
  });
  const [orders, setOrders] = useState<LoadState<BillingOrderRecord[]>>({
    status: "idle",
    data: [],
    error: null,
    loadedAt: null,
  });

  const deploymentsRequestRef = useRef(0);
  const ordersRequestRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = () => {
      setRoute(readInitialRoute());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const getApiAuthToken = useCallback<ApiAuthTokenResolver>(async () => {
    if (hasSession) {
      if (!resolveSessionToken) {
        throw new Error("Signed-in WorkOS session has no token resolver configured.");
      }
      const token = await resolveSessionToken();
      if (token.trim()) {
        return token.trim();
      }
      throw new Error("Signed-in WorkOS session returned an empty access token.");
    }
    return apiAuthToken.trim();
  }, [apiAuthToken, hasSession, resolveSessionToken]);

  const goToRoute = useCallback((next: AppRoute) => {
    setRoute(next);
    if (typeof window === "undefined") return;
    const targetPath = routePath(next);
    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, "", targetPath);
    }
  }, []);

  const hasManualToken = Boolean(apiAuthToken.trim());
  const hasWorkosSession = hasSession;
  const protectedAccess = !workosEnabled || hasWorkosSession || hasManualToken;
  const manualToken = useMemo(() => shortToken(apiAuthToken), [apiAuthToken]);

  const authScopeKey = useMemo(() => {
    if (workosEnabled && hasWorkosSession) {
      return `workos:${userLabel || ""}`;
    }
    return `manual:${apiAuthToken.trim()}`;
  }, [apiAuthToken, hasWorkosSession, userLabel, workosEnabled]);

  const saveAuthToken = useCallback((next: string) => {
    const persisted = persistApiAuthToken(next);
    setApiAuthToken(persisted || AUTH_TOKEN_ENV);
    setAuthModalOpen(false);
  }, []);

  const clearAuthToken = useCallback(() => {
    const persisted = persistApiAuthToken("");
    setApiAuthToken(persisted || AUTH_TOKEN_ENV);
  }, []);

  const resetDataState = useCallback(() => {
    deploymentsRequestRef.current += 1;
    ordersRequestRef.current += 1;
    setDeployments({
      status: "idle",
      data: [],
      error: null,
      loadedAt: null,
    });
    setOrders({
      status: "idle",
      data: [],
      error: null,
      loadedAt: null,
    });
  }, []);

  useEffect(() => {
    resetDataState();
  }, [authScopeKey, resetDataState]);

  const loadDeployments = useCallback(async () => {
    const requestId = ++deploymentsRequestRef.current;
    setDeployments({
      status: "loading",
      data: [],
      error: null,
      loadedAt: null,
    });
    try {
      const headers = await buildApiHeadersFromResolver(getApiAuthToken);
      const response = await fetch(`${API_BASE}/v1/deployments`, { headers });
      const payload = await parseApiResponse<{ deployments: DeploymentRecord[] }>(response);
      if (requestId !== deploymentsRequestRef.current) {
        return;
      }
      if (!response.ok || !payload.ok) {
        setDeployments({
          status: "error",
          data: [],
          error: (!payload.ok && payload.error) || `Request failed with HTTP ${response.status}`,
          loadedAt: new Date().toISOString(),
        });
        return;
      }
      setDeployments({
        status: "ready",
        data: payload.deployments || [],
        error: null,
        loadedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (requestId !== deploymentsRequestRef.current) {
        return;
      }
      setDeployments({
        status: "error",
        data: [],
        error: error instanceof Error ? error.message : String(error),
        loadedAt: new Date().toISOString(),
      });
    }
  }, [getApiAuthToken]);

  const loadOrders = useCallback(async () => {
    const requestId = ++ordersRequestRef.current;
    setOrders({
      status: "loading",
      data: [],
      error: null,
      loadedAt: null,
    });
    try {
      const headers = await buildApiHeadersFromResolver(getApiAuthToken);
      const response = await fetch(`${API_BASE}/v1/orders`, { headers });
      const payload = await parseApiResponse<{ orders: BillingOrderRecord[] }>(response);
      if (requestId !== ordersRequestRef.current) {
        return;
      }
      if (!response.ok || !payload.ok) {
        setOrders({
          status: "error",
          data: [],
          error: (!payload.ok && payload.error) || `Request failed with HTTP ${response.status}`,
          loadedAt: new Date().toISOString(),
        });
        return;
      }
      setOrders({
        status: "ready",
        data: payload.orders || [],
        error: null,
        loadedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (requestId !== ordersRequestRef.current) {
        return;
      }
      setOrders({
        status: "error",
        data: [],
        error: error instanceof Error ? error.message : String(error),
        loadedAt: new Date().toISOString(),
      });
    }
  }, [getApiAuthToken]);

  useEffect(() => {
    if (!protectedAccess) {
      resetDataState();
      return;
    }
    if (route === "deployments") {
      void loadDeployments();
      return;
    }
    if (route === "billing") {
      void loadOrders();
    }
  }, [loadDeployments, loadOrders, protectedAccess, route, resetDataState]);

  const pageContent = useMemo(() => {
    if (route === "overview") {
      return (
        <OverviewRoute
          hasWorkosSession={hasWorkosSession}
          hasManualToken={hasManualToken}
          protectedAccess={protectedAccess}
          userLabel={userLabel}
          deploymentsLoadedAt={deployments.loadedAt}
          ordersLoadedAt={orders.loadedAt}
          deploymentsCount={deployments.data.length}
          ordersCount={orders.data.length}
          manualToken={apiAuthToken}
          onGoToDeployments={() => goToRoute("deployments")}
          onGoToBilling={() => goToRoute("billing")}
          onOpenConnectors={() => setDiscordOpen(true)}
        />
      );
    }

    if (!protectedAccess) {
      return (
        <ProtectedRoute
          status={statusMessages[deployments.status]}
          protectedAccess={protectedAccess}
          onSignIn={onSignInCta}
          signInDisabled={signInCtaDisabled}
          onOpenAuthModal={() => setAuthModalOpen(true)}
        />
      );
    }

    if (route === "deployments") {
      return (
        <DeploymentsRoute
          status={deployments.status}
          deployments={deployments.data}
          error={deployments.error}
          loadedAt={deployments.loadedAt}
          onRefresh={() => void loadDeployments()}
          isRefreshing={deployments.status === "loading"}
        />
      );
    }

    return (
      <BillingRoute
        status={orders.status}
        orders={orders.data}
        error={orders.error}
        loadedAt={orders.loadedAt}
        onRefresh={() => void loadOrders()}
        isRefreshing={orders.status === "loading"}
      />
    );
  }, [
    route,
    hasWorkosSession,
    hasManualToken,
    protectedAccess,
    userLabel,
    deployments.loadedAt,
    orders.loadedAt,
    deployments.data.length,
    orders.data.length,
    deployments.data,
    orders.data,
    deployments.status,
    orders.status,
    deployments.error,
    orders.error,
    onSignInCta,
    signInCtaDisabled,
    apiAuthToken,
    goToRoute,
    loadDeployments,
    loadOrders,
  ]);

  return (
    <div className="container appShell">
      <ShellHeader
        hasSession={hasSession}
        userLabel={userLabel}
        loading={props.auth.loading}
        hasManualToken={hasManualToken}
        manualToken={manualToken}
        authBadge={props.auth.authBadge}
        onAuthAction={props.auth.onAuthAction}
        authActionLabel={props.auth.authActionLabel}
        authActionDisabled={props.auth.authActionDisabled}
        onOpenAuthModal={() => setAuthModalOpen(true)}
      />

      <ShellTabs route={route} onChangeRoute={goToRoute} />

      {pageContent}

      <AuthModal
        open={authModalOpen}
        token={apiAuthToken}
        onSave={saveAuthToken}
        onClear={() => {
          clearAuthToken();
          setAuthModalOpen(false);
        }}
        onClose={() => setAuthModalOpen(false)}
      />

      <DiscordConnector open={discordOpen} getApiAuthToken={getApiAuthToken} onClose={() => setDiscordOpen(false)} />
    </div>
  );
}

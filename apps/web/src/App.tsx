import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@workos-inc/authkit-react";
import { WORKOS_ENABLED } from "./app/env";
import { isAppPath } from "./app/routes";
import { LaunchpadShell } from "./views/LaunchpadShell";
import { PublicLanding } from "./views/PublicLanding";

function AppManualAuth() {
  return (
    <LaunchpadShell
      auth={{
        workosEnabled: false,
        hasSession: false,
        userLabel: null,
        loading: false,
        authBadge: "WorkOS: not configured",
      }}
    />
  );
}

function AppWorkosAuth() {
  const { isLoading, user, getAccessToken, signIn, signOut } = useAuth();
  const hasSession = Boolean(user);
  const userLabel = user?.email || user?.id || (hasSession ? "signed in user" : null);
  const authBadge = isLoading ? "WorkOS: checking session" : hasSession ? `WorkOS: ${userLabel}` : "WorkOS: signed out";

  const authActionLabel = isLoading ? "Checking…" : hasSession ? "Sign out" : "Sign in";
  const onAuthAction = useCallback(() => {
    void (hasSession ? signOut() : signIn());
  }, [hasSession, signIn, signOut]);

  const resolveSessionToken = useCallback(async () => {
    const token = await getAccessToken();
    return token.trim();
  }, [getAccessToken]);

  return (
    <LaunchpadShell
      auth={{
        workosEnabled: true,
        hasSession,
        userLabel,
        loading: isLoading,
        authBadge,
        authActionLabel,
        onAuthAction,
        authActionDisabled: isLoading,
        onSignInCta: hasSession ? undefined : () => void signIn(),
        signInCtaDisabled: isLoading,
        resolveSessionToken,
      }}
    />
  );
}

function PublicLandingWorkosAuth() {
  const { isLoading, user, signIn, signOut } = useAuth();
  const hasSession = Boolean(user);
  const userLabel = user?.email || user?.id || (hasSession ? "signed in user" : null);

  const onSignIn = useCallback(() => {
    void signIn();
  }, [signIn]);

  const onSignOut = useCallback(() => {
    void signOut();
  }, [signOut]);

  return (
    <PublicLanding
      auth={{
        workosEnabled: true,
        hasSession,
        loading: isLoading,
        userLabel,
        onSignIn,
        onSignOut,
      }}
    />
  );
}

export function App() {
  const [pathname, setPathname] = useState(() => {
    if (typeof window === "undefined") return "/";
    return window.location.pathname || "/";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = () => setPathname(window.location.pathname || "/");
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (!isAppPath(pathname)) {
    if (WORKOS_ENABLED) {
      return <PublicLandingWorkosAuth />;
    }
    return <PublicLanding />;
  }

  if (WORKOS_ENABLED) {
    return <AppWorkosAuth />;
  }
  return <AppManualAuth />;
}

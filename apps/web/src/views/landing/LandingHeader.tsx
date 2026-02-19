import { motion } from "framer-motion";
import type { LandingAuthConfig } from "../../app/types";
import { landingNav } from "./content";

type LandingHeaderProps = {
  auth?: LandingAuthConfig;
};

export function LandingHeader(props: { auth?: LandingAuthConfig }) {
  const auth = props.auth;
  const authEnabled = Boolean(auth?.workosEnabled);
  const hasWorkosSession = authEnabled && Boolean(auth?.hasSession);

  return (
    <header className="landingHeader">
      <motion.div
        className="landingShell landingHeaderInner"
        initial={{ y: -14, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <a href="/" className="landingBrand" aria-label="Claw Launchpad home">
          <div className="landingLogo" />
        <div className="landingBrandText">
          <strong>Claw Launchpad</strong>
          <span>Operator-grade AI infrastructure</span>
        </div>
      </a>

        <nav className="landingNav" aria-label="Landing navigation">
          {landingNav.map((item) => (
            <a key={item.label} className="landingNavLink" href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="landingHeaderActions">
          {auth && authEnabled ? (
            hasWorkosSession ? (
              <button className="landingBtn landingBtnGhost" onClick={() => void auth.onSignOut()} disabled={auth.loading}>
                {auth.loading ? "Checking…" : "Sign out"}
              </button>
            ) : (
              <button className="landingBtn landingBtnGhost" onClick={() => void auth.onSignIn()} disabled={auth.loading}>
                {auth.loading ? "Checking…" : "Sign in"}
              </button>
            )
          ) : (
            <button className="landingBtn landingBtnGhost" onClick={() => window.location.assign("/app")}>
              Continue in local mode
            </button>
          )}
          <a className="landingBtn landingBtnPrimary" href="/app">
            Open operator workspace
          </a>
        </div>
      </motion.div>
    </header>
  );
}

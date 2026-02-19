import { useMemo } from "react";
import type { LandingAuthConfig } from "../../app/types";
import { BlurFade } from "../../components/magic/BlurFade";
import { GridPattern } from "../../components/magic/GridPattern";
import { OrbitingCircles } from "../../components/magic/OrbitingCircles";
import { defaultSessionCopy } from "./content";

type LandingHeroProps = {
  auth?: LandingAuthConfig;
  onOpenApp: () => void;
  onSignIn?: () => void;
};

const operatorSignals = [
  {
    label: "Identity",
    detail: "WorkOS sessions and manual bearer tokens resolve the same tenant owner graph.",
  },
  {
    label: "Billing",
    detail: "Checkout routes to deployment through ownership-preserving order lineage.",
  },
  {
    label: "Operations",
    detail: "Status transitions, retries, and cancellation are a single, explicit control loop.",
  },
];

export function LandingHero(props: LandingHeroProps) {
  const auth = props.auth;
  const sessionText = defaultSessionCopy(auth);

  const orbitNodes = useMemo(
    () =>
      [
        "Identity",
        "Deploy",
        "Billing",
        "Webhook",
        "Connector",
        "Scope",
      ].map((label) => (
        <span className="landingOrbitBadge" key={label}>
          {label}
        </span>
      )),
    [],
  );

  return (
    <section className="landingShell landingHero">
      <div className="landingHeroPanel">
        <GridPattern className="landingHeroGrid" width={52} height={52} />

        <BlurFade className="landingHeroContent" direction="right" inViewMargin="-40px">
          <p className="landingKicker">Tenant-first control plane</p>
          <h1 className="landingTitle">Build AI deployment systems operators can trust at 3 AM.</h1>
          <p className="landingSubtitle">
            Claw Launchpad is the production-grade control plane for AI tooling teams: secure multi-tenant isolation, explicit
            billing lineage, and first-class visibility into each deployment decision.
          </p>

          <div className="landingSession">{sessionText}</div>

          <div className="landingHeroActions">
            {auth?.workosEnabled && !auth.hasSession ? (
              <button className="landingBtn landingBtnPrimary" onClick={() => void props.onSignIn?.()} disabled={auth.loading}>
                {auth.loading ? "Checking identity…" : "Sign in and open workspace"}
              </button>
            ) : (
              <button className="landingBtn landingBtnPrimary" onClick={props.onOpenApp}>
                Open operator workspace
              </button>
            )}
            <a className="landingBtn landingBtnGhost" href="#workflow">
              Explore workflow
            </a>
          </div>

          <ul className="landingMicroList landingSignalList">
            {operatorSignals.map((signal) => (
              <li key={signal.label}>
                <strong>{signal.label}:</strong> {signal.detail}
              </li>
            ))}
          </ul>
        </BlurFade>

        <BlurFade className="landingHeroMedia" direction="left" delay={0.12}>
          <div className="landingHeroMediaFrame">
            <div className="landingHeroVisualShell">
              <OrbitingCircles className="landingOrbitCore" reverse={true} radius={118} iconSize={38} duration={24}>
                {orbitNodes}
              </OrbitingCircles>
            </div>
          </div>
          <div className="landingHeroMetrics">
            <div className="landingHeroMetric">
              <span>Deployment</span>
              <strong>Scoped by owner</strong>
            </div>
            <div className="landingHeroMetric">
              <span>Billing</span>
              <strong>Lineage preserved</strong>
            </div>
            <div className="landingHeroMetric">
              <span>Auth</span>
              <strong>WorkOS + token parity</strong>
            </div>
          </div>
        </BlurFade>
      </div>
    </section>
  );
}

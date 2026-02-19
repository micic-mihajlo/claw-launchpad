import type { LandingAuthConfig } from "../app/types";
import { LandingCtaSection } from "./landing/LandingCtaSection";
import { LandingControlsSection } from "./landing/LandingControlsSection";
import { LandingFaqSection } from "./landing/LandingFaqSection";
import { LandingHeader } from "./landing/LandingHeader";
import { LandingHero } from "./landing/LandingHero";
import { LandingPricingSection } from "./landing/LandingPricingSection";
import { LandingProofSection } from "./landing/LandingProofSection";
import { LandingWorkflowSection } from "./landing/LandingWorkflowSection";

export function PublicLanding(props: { auth?: LandingAuthConfig }) {
  return (
    <div className="landingRoot">
      <div className="landingBackdrop" />
      <LandingHeader auth={props.auth} />
      <LandingHero auth={props.auth} onOpenApp={() => window.location.assign("/app")} onSignIn={props.auth?.onSignIn} />
      <div className="landingBody">
        <LandingWorkflowSection />
        <LandingControlsSection />
        <LandingProofSection />
        <LandingPricingSection />
        <LandingFaqSection />
        <LandingCtaSection onOpenApp={() => window.location.assign("/app")} />
      </div>

      <footer className="landingShell landingFooter">
        <span>© {new Date().getFullYear()} Claw Launchpad</span>
        <span>From checkout to endpoint, ownership-aware by design.</span>
      </footer>
    </div>
  );
}

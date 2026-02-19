import { Marquee } from "../../components/magic/Marquee";
import { partnerSignatures, proofPoints } from "./content";
import { LandingSection } from "./LandingSection";

export function LandingProofSection() {
  return (
    <LandingSection
      id="proof"
      eyebrow="Proof"
      title="Signals, not slogans."
      lead="The team sees clear outcomes before any release: ownership, lineage, and operational guardrails."
    >
      <div className="landingPartnerRail">
        <Marquee className="landingLogoMarquee" repeat={3} pauseOnHover>
          {partnerSignatures.map((item) => (
            <span key={item} className="landingLogoItem">
              {item}
            </span>
          ))}
        </Marquee>
      </div>

      <div className="landingVoices">
        {proofPoints.map((proof) => (
          <article key={proof.quote} className="landingVoiceCard">
            <p className="landingVoiceQuote">“{proof.quote}”</p>
            <div className="landingVoiceMeta">{proof.source}</div>
          </article>
        ))}
      </div>
    </LandingSection>
  );
}

import { Marquee } from "../../components/magic/Marquee";
import { workflowCards } from "./content";
import { LandingSection } from "./LandingSection";

export function LandingWorkflowSection() {
  return (
    <LandingSection
      id="workflow"
      eyebrow="Execution model"
      title="No mystery. No hidden state. No surprise side effects."
      lead="Every deployment request follows a consistent path from intent to endpoint, with owner checks at each boundary."
    >
      <div className="landingFlowWrap">
        <div className="landingHowGrid">
          {workflowCards.map((card) => (
            <article
              key={card.title}
              className={`landingHowCard ${card.number === "02" ? "landingHowCardWide" : ""}`}
            >
              <span className="landingHowNumber">{card.number}</span>
              <h3>{card.title}</h3>
              <p>{card.detail}</p>
            </article>
          ))}
        </div>

        <Marquee className="landingFlowTicker" repeat={8} pauseOnHover>
          <span className="landingFlowPill">auth scope</span>
          <span className="landingFlowPill">session resolved</span>
          <span className="landingFlowPill">owner validated</span>
          <span className="landingFlowPill">billing linked</span>
          <span className="landingFlowPill">deploy queued</span>
          <span className="landingFlowPill">state emitted</span>
        </Marquee>
      </div>
    </LandingSection>
  );
}

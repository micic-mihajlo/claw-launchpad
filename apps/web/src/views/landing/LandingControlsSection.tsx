import { platformOfferings } from "./content";
import { LandingSection } from "./LandingSection";

export function LandingControlsSection() {
  return (
    <LandingSection
      id="controls"
      eyebrow="Platform controls"
      title="Built for operators who move fast and sleep at night."
      lead="The defaults are safe. Optional controls are explicit and always visible."
    >
      <div className="landingFeatureBoard">
        {platformOfferings.map((offering) => (
          <article key={offering.title} className="landingFeatureCell">
            <h3>{offering.title}</h3>
            <p>{offering.lead}</p>
            <ul className="landingOfferingList">
              {offering.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </LandingSection>
  );
}

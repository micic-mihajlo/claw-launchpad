import { faqs } from "./content";
import { LandingSection } from "./LandingSection";

export function LandingFaqSection() {
  return (
    <LandingSection
      id="faq"
      eyebrow="Questions"
      title="Fast answers for operators."
      lead="If this is mission-critical infrastructure, answers need to be short and practical."
    >
      <div className="landingFaq">
        {faqs.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </LandingSection>
  );
}

import { pricingCards } from "./content";
import { LandingSection } from "./LandingSection";

export function LandingPricingSection() {
  return (
    <LandingSection
      id="pricing"
      eyebrow="Plans"
      title="Predictable pricing for production control"
      lead="Choose the guardrail depth your team needs today, then scale up without rewiring."
    >
      <div className="landingPricingGrid">
        {pricingCards.map((card) => (
          <article key={card.name} className={`landingPriceCard ${card.highlighted ? "landingPricePrimary" : ""}`}>
            <h3>{card.name}</h3>
            <div className="landingPriceValue">{card.value}</div>
            <span>{card.period}</span>
            <p>{card.pitch}</p>
            <ul className="landingPriceList">
              {card.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
            <a className="landingPriceAction" href="/app">
              {card.action}
            </a>
          </article>
        ))}
      </div>
    </LandingSection>
  );
}

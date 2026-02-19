type LandingCtaSectionProps = {
  onOpenApp: () => void;
};

export function LandingCtaSection(props: LandingCtaSectionProps) {
  return (
    <section className="landingShell landingCta">
      <h2>Replace fragile infrastructure scripts with a reliable control plane.</h2>
      <p>
        Move from brittle operators' rituals to tenant-safe workflows with explicit ownership, secure defaults, and clear deployment states.
      </p>
      <div className="landingHeroActions">
        <button className="landingBtn landingBtnDark" onClick={props.onOpenApp}>
          Launch workspace
        </button>
        <a className="landingBtn landingBtnGhost" href="/app/deployments">
          Open deployments
        </a>
      </div>
    </section>
  );
}

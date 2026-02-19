type ShellHeaderProps = {
  hasSession: boolean;
  userLabel: string | null;
  loading: boolean;
  hasManualToken: boolean;
  manualToken: string;
  authBadge: string;
  onAuthAction?: () => void;
  authActionLabel?: string;
  authActionDisabled?: boolean;
  onOpenAuthModal: () => void;
};

export function ShellHeader(props: ShellHeaderProps) {
  return (
    <header className="header appHeader">
      <div className="brand">
        <div className="logo" />
        <div className="brandText">
          <strong>Claw Launchpad</strong>
          <span>Operator workspace</span>
        </div>
      </div>

      <div className="row appHeaderActions">
        {props.authActionLabel && props.onAuthAction ? (
          <button className="btn btnPrimary" onClick={props.onAuthAction} disabled={props.authActionDisabled}>
            {props.authActionLabel}
          </button>
        ) : null}
        <button className="btn" onClick={props.onOpenAuthModal}>
          {props.hasManualToken ? "Update API token" : "Set API token"}
        </button>
      </div>

        <div className="appMetaBar">
          <span className="tokenBadge">{props.authBadge}</span>
          <span className="tokenBadge">API token: {props.hasManualToken ? props.manualToken : "not set"}</span>
          <span className="tokenBadge">
          {props.hasSession ? `Identity: ${props.userLabel || "authenticated"}` : "Identity: not active"}
          {props.loading ? "…" : ""}
          </span>
        </div>
      </header>
  );
}

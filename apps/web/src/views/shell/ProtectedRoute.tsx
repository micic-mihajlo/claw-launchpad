type ProtectedRouteProps = {
  status: string;
  protectedAccess: boolean;
  onSignIn?: () => void;
  signInDisabled?: boolean;
  onOpenAuthModal: () => void;
};

export function ProtectedRoute(props: ProtectedRouteProps) {
  return (
    <div className="hero appPage">
      <div className="panel dataPanel">
        <div className="panelHeader panelHeaderSplit">
          <h2>Sign-in required</h2>
          <span className="hintInline">{props.status}</span>
        </div>
        <div className="panelBody">
          <p className="sub subNoMargin">
            Sign in with WorkOS or set a manual token to access tenant-scoped deployments and billing.
          </p>
          <div className="row rowMarginTopMd">
            {props.onSignIn ? (
              <button className="btn btnPrimary" onClick={props.onSignIn} disabled={props.signInDisabled}>
                {props.signInDisabled ? "Checking identity…" : "Sign in with WorkOS"}
              </button>
            ) : null}
            <button className="btn" onClick={props.onOpenAuthModal}>
              Set manual token
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

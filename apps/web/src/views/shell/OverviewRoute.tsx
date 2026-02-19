import { formatDateTime } from "../../app/formatters";
import { Tile } from "../../components/Tile";
import { shortToken } from "../../app/authToken";

type OverviewProps = {
  hasWorkosSession: boolean;
  hasManualToken: boolean;
  protectedAccess: boolean;
  userLabel: string | null;
  deploymentsLoadedAt: string | null;
  ordersLoadedAt: string | null;
  deploymentsCount: number;
  ordersCount: number;
  manualToken: string;
  onGoToDeployments: () => void;
  onGoToBilling: () => void;
  onOpenConnectors: () => void;
};

export function OverviewRoute(props: OverviewProps) {
  return (
    <div className="hero appPage">
      <div className="heroInner">
        <div>
          <p className="landingKicker">Operator Workspace</p>
          <h1 className="h1">Your tenant-safe control room.</h1>
          <p className="sub">
            Identity, deployment intent, and billing lifecycle are unified in one view so operators can act quickly and stay in control.
          </p>
          <div className="chips">
            <span className="chip">Auth: {props.hasWorkosSession ? "WorkOS" : "Manual token"}</span>
            <span className="chip">Scope guard: {props.protectedAccess ? "on" : "off"}</span>
            <span className="chip">Connector: <span className="monoInline">Discord allowlist</span></span>
          </div>

          <div className="row rowMarginTopLg">
            <button className="btn btnPrimary" onClick={props.onGoToDeployments}>
              Open deployments
            </button>
            <button className="btn" onClick={props.onGoToBilling}>
              Open billing
            </button>
            <button className="btn" onClick={props.onOpenConnectors}>
              Configure connectors
            </button>
          </div>
        </div>

        <div className="grid">
          <section className="panel">
            <header className="panelHeader">
              <h2>Session &amp; identity</h2>
            </header>
            <div className="panelBody">
              <div className="summaryRow">
                <span>Active operator</span>
                <b>{props.userLabel || (props.hasWorkosSession ? "WorkOS user" : "Manual token")}</b>
              </div>
              <div className="summaryRow">
                <span>Manual token</span>
                <b>{props.hasManualToken ? shortToken(props.manualToken) : "not set"}</b>
              </div>
              <div className="summaryRow">
                <span>Scope boundary</span>
                <b>{props.protectedAccess ? "tenant-gated" : "open (auth not bound)"}</b>
              </div>
            </div>
          </section>

          <section className="panel">
            <header className="panelHeader">
              <h2>Runtime signal</h2>
            </header>
            <div className="panelBody">
              <div className="summaryRow">
                <span>Deployments loaded</span>
                <b>{props.deploymentsCount}</b>
              </div>
              <div className="summaryRow">
                <span>Billing records loaded</span>
                <b>{props.ordersCount}</b>
              </div>
              <div className="summaryRow">
                <span>Last deployments sync</span>
                <b>{formatDateTime(props.deploymentsLoadedAt)}</b>
              </div>
              <div className="summaryRow">
                <span>Last orders sync</span>
                <b>{formatDateTime(props.ordersLoadedAt)}</b>
              </div>
            </div>
          </section>

          <section className="panel">
            <header className="panelHeader">
              <h2>Connector posture</h2>
            </header>
            <div className="panelBody">
              <div className="tiles">
                <Tile title="Discord" meta="active" desc="Allowlist + mention checks" onClick={props.onOpenConnectors} />
                <Tile title="Slack" meta="roadmap" desc="Production-safe connector path prepared" />
                <Tile title="Telegram" meta="roadmap" desc="Bot + allowlist planning in progress" />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

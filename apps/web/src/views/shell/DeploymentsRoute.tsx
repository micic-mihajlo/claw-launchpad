import { compactId, formatDateTime, statusClass } from "../../app/formatters";
import type { DeploymentRecord, LoadState } from "../../app/types";

type DeploymentsRouteProps = {
  status: LoadState<DeploymentRecord[]>["status"];
  deployments: DeploymentRecord[];
  error: string | null;
  loadedAt: string | null;
  onRefresh: () => void;
  isRefreshing: boolean;
};

export function DeploymentsRoute(props: DeploymentsRouteProps) {
  return (
    <section className="hero appPage">
      <div className="panel dataPanel">
        <div className="panelHeader panelHeaderSplit">
          <h2>Deployments</h2>
          <div className="row">
            <span className="hintInline">Updated: {props.loadedAt || "—"}</span>
            <button className="btn" onClick={props.onRefresh} disabled={props.isRefreshing}>
              {props.isRefreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="panelBody">
          {props.error ? <div className="errorBanner">{props.error}</div> : null}
          {props.status === "loading" ? <div className="sub">Loading deployment records…</div> : null}
          {props.status === "ready" && props.deployments.length === 0 ? (
            <div className="sub">No deployments for this tenant yet. Provision from checkout or by manual flow.</div>
          ) : null}

          <div className="listWrap">
            {props.deployments.map((deployment) => (
              <article key={deployment.id} className="listItem">
                <div className="listTop">
                  <strong>{deployment.name}</strong>
                  <span className={statusClass(deployment.status)}>{deployment.status}</span>
                </div>
                <div className="listMeta">
                  <span>Deployment ID: {compactId(deployment.id)}</span>
                  <span>Provider: {deployment.provider}</span>
                  <span>Billing ref: {deployment.billingRef ? compactId(deployment.billingRef) : "none"}</span>
                  <span>Last change: {formatDateTime(deployment.updatedAt)}</span>
                </div>
                {deployment.tailnetUrl ? (
                  <div className="row rowMarginTopSm">
                    <a className="btn" href={deployment.tailnetUrl} target="_blank" rel="noreferrer">
                      Open tailnet URL
                    </a>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

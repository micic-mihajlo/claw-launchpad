import { compactId, formatAmount, formatDateTime, statusClass } from "../../app/formatters";
import type { BillingOrderRecord, LoadState } from "../../app/types";

type BillingRouteProps = {
  status: LoadState<BillingOrderRecord[]>["status"];
  orders: BillingOrderRecord[];
  error: string | null;
  loadedAt: string | null;
  onRefresh: () => void;
  isRefreshing: boolean;
};

export function BillingRoute(props: BillingRouteProps) {
  return (
    <section className="hero appPage">
      <div className="panel dataPanel">
        <div className="panelHeader panelHeaderSplit">
          <h2>Billing orders</h2>
          <div className="row">
            <span className="hintInline">Updated: {props.loadedAt || "—"}</span>
            <button className="btn" onClick={props.onRefresh} disabled={props.isRefreshing}>
              {props.isRefreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="panelBody">
          {props.error ? <div className="errorBanner">{props.error}</div> : null}
          {props.status === "loading" ? <div className="sub">Loading billing records…</div> : null}
          {props.status === "ready" && props.orders.length === 0 ? (
            <div className="sub">No billing orders for this tenant yet. The first paid order will appear here.</div>
          ) : null}

          <div className="listWrap">
            {props.orders.map((order) => (
              <article key={order.id} className="listItem">
                <div className="listTop">
                  <strong>{order.planId}</strong>
                  <span className={statusClass(order.status)}>{order.status}</span>
                </div>
                <div className="listMeta">
                  <span>Order: {compactId(order.id)}</span>
                  <span>Amount: {formatAmount(order.amountCents, order.currency)}</span>
                  <span>Customer: {order.customerEmail || "n/a"}</span>
                  <span>Created: {formatDateTime(order.createdAt)}</span>
                </div>
                <div className="listMeta">
                  <span>Deployment: {order.deploymentId ? compactId(order.deploymentId) : "not linked"}</span>
                  <span>Updated: {formatDateTime(order.updatedAt)}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

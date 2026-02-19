import type { AppRoute } from "../../app/types";

type ShellTabsProps = {
  route: AppRoute;
  onChangeRoute: (next: AppRoute) => void;
};

export function ShellTabs(props: ShellTabsProps) {
  return (
    <div className="routeTabs appTabs" role="tablist" aria-label="Workspace sections">
      <button
        className={`routeTab ${props.route === "overview" ? "routeTabActive" : ""}`}
        role="tab"
        aria-selected={props.route === "overview"}
        onClick={() => props.onChangeRoute("overview")}
      >
        Overview
      </button>
      <button
        className={`routeTab ${props.route === "deployments" ? "routeTabActive" : ""}`}
        role="tab"
        aria-selected={props.route === "deployments"}
        onClick={() => props.onChangeRoute("deployments")}
      >
        Deployments
      </button>
      <button
        className={`routeTab ${props.route === "billing" ? "routeTabActive" : ""}`}
        role="tab"
        aria-selected={props.route === "billing"}
        onClick={() => props.onChangeRoute("billing")}
      >
        Billing
      </button>
    </div>
  );
}

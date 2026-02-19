export function Tile(props: {
  title: string;
  meta: string;
  desc: string;
  onClick?: () => void;
  soon?: boolean;
}) {
  const interactive = Boolean(props.onClick) && !props.soon;

  return (
    <article
      className={`tile ${props.soon ? "tileSoon" : ""}`}
      onClick={interactive ? props.onClick : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                props.onClick?.();
              }
            }
          : undefined
      }
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : -1}
      aria-disabled={props.soon ? true : undefined}
    >
      <div className="tileTitle">
        <strong>{props.title}</strong>
        <span>{props.meta}</span>
      </div>
      <div className="tileDesc">{props.desc}</div>
    </article>
  );
}

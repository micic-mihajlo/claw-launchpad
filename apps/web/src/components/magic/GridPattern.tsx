import { useId } from "react";

type GridPatternProps = {
  width?: number;
  height?: number;
  strokeDasharray?: string;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
};

export function GridPattern({
  width = 42,
  height = 42,
  strokeDasharray = "",
  strokeWidth = 1,
  className = "",
  style,
}: GridPatternProps) {
  const id = useId();

  return (
    <svg
      aria-hidden="true"
      className={"magicGridPattern " + className}
      style={style}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <defs>
        <pattern id={id} width={width} height={height} patternUnits="userSpaceOnUse">
          <path
            d={`M0 ${height}V0H${width}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDasharray}
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

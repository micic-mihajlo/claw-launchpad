import { useMemo } from "react";
import type { ReactNode } from "react";

type OrbitingCirclesProps = {
  children?: ReactNode;
  reverse?: boolean;
  duration?: number;
  radius?: number;
  path?: boolean;
  iconSize?: number;
  speed?: number;
  className?: string;
};

export function OrbitingCircles({
  children,
  reverse = false,
  duration = 18,
  radius = 160,
  path = true,
  iconSize = 36,
  speed = 1,
  className = "",
}: OrbitingCirclesProps) {
  const items = useMemo(() => {
    if (!children) return [] as Array<{ node: ReactNode; angle: number }>;
    if (Array.isArray(children)) {
      return children.map((node, index) => ({ node, angle: (360 / children.length) * index }));
    }
    return [{ node: children, angle: 0 }];
  }, [children]);

  if (items.length === 0) {
    return null;
  }

  const realDuration = duration / Math.max(0.1, speed);

  return (
    <div className={`magicOrbitWrap ${className}`}>
      {path ? (
        <svg className="magicOrbitPath" viewBox="0 0 400 400" aria-hidden="true">
          <circle cx="200" cy="200" r={radius} fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      ) : null}
      {items.map(({ node, angle }, index) => (
        <div
          key={`${index}-${angle}`}
          className="magicOrbitNode"
          style={{
            "--magic-orbit-angle": `${angle}deg`,
            "--magic-orbit-radius": `${radius}px`,
            "--magic-orbit-duration": `${realDuration}s`,
            "--magic-orbit-size": `${iconSize}px`,
            "--magic-orbit-reverse": reverse ? "reverse" : "normal",
          } as React.CSSProperties}
        >
          <div className="magicOrbitInner">{node}</div>
        </div>
      ))}
    </div>
  );
}

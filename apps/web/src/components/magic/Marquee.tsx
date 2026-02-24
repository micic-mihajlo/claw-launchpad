import { type ReactNode } from "react";

type MarqueeProps = {
  className?: string;
  reverse?: boolean;
  pauseOnHover?: boolean;
  children: ReactNode;
  vertical?: boolean;
  repeat?: number;
};

export function Marquee({
  className = "",
  reverse = false,
  pauseOnHover = false,
  children,
  vertical = false,
  repeat = 4,
}: MarqueeProps) {
  const tracks = Array.from({ length: Math.max(1, repeat) }, () => children);

  return (
    <div className={["magicMarquee", className].filter(Boolean).join(" ")} data-vertical={vertical ? "true" : "false"}>
      {tracks.map((track, index) => (
        <div
          key={index}
          className={`magicMarqueeTrack ${vertical ? "magicMarqueeTrackVertical" : "magicMarqueeTrackHorizontal"}`}
          data-reverse={reverse ? "true" : "false"}
          data-hover={pauseOnHover ? "true" : "false"}
        >
          {track}
        </div>
      ))}
    </div>
  );
}

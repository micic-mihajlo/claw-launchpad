import { motion } from "framer-motion";
import type { MotionProps, Variants } from "framer-motion";
import type { ReactNode } from "react";

type BlurFadeProps = MotionProps & {
  children: ReactNode;
  className?: string;
  duration?: number;
  delay?: number;
  distance?: number;
  direction?: "up" | "down" | "left" | "right";
  inView?: boolean;
  inViewMargin?: string;
  blur?: number;
};

export function BlurFade({
  children,
  className,
  duration = 0.45,
  delay = 0,
  distance = 12,
  direction = "up",
  inView = true,
  inViewMargin = "-50px",
  blur = 7,
  ...motionProps
}: BlurFadeProps) {
  const directionMap = {
    up: { y: distance, x: 0 },
    down: { y: -distance, x: 0 },
    left: { x: distance, y: 0 },
    right: { x: -distance, y: 0 },
  } as const;

  const hiddenState = {
    ...directionMap[direction],
    opacity: 0,
    filter: `blur(${blur}px)`,
  };

  const visibleState = {
    x: 0,
    y: 0,
    opacity: 1,
    filter: "blur(0px)",
  };

  const variants: Variants = {
    hidden: hiddenState,
    visible: visibleState,
  };

  return (
    <motion.div
      className={className}
      initial="hidden"
      animate={inView ? undefined : "visible"}
      whileInView={inView ? "visible" : undefined}
      viewport={inView ? { once: true, amount: 0.25, margin: inViewMargin } : undefined}
      exit="hidden"
      variants={variants}
      transition={{
        duration,
        delay: 0.03 + delay,
        ease: "easeOut",
      }}
      {...motionProps}
    >
      {children}
    </motion.div>
  );
}

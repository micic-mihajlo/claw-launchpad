"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { flushSync } from "react-dom";
import { cn } from "@/lib/utils";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void> };
};

interface ThemeToggleProps extends React.ComponentPropsWithoutRef<"button"> {
  duration?: number;
}

export function ThemeToggle({ className, duration = 400, ...props }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = useCallback(async () => {
    if (!mounted || !buttonRef.current) {
      return;
    }

    const isDark = resolvedTheme === "dark";
    const nextTheme = isDark ? "light" : "dark";
    const doc = document as ViewTransitionDocument;

    if (!doc.startViewTransition) {
      setTheme(nextTheme);
      return;
    }

    await doc
      .startViewTransition(() => {
        flushSync(() => {
          setTheme(nextTheme);
        });
      })
      .ready;

    const { left, top, width, height } = buttonRef.current.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const maxRadius = Math.hypot(
      Math.max(left, window.innerWidth - left),
      Math.max(top, window.innerHeight - top),
    );

    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${maxRadius}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration,
        easing: "ease-in-out",
        pseudoElement: "::view-transition-new(root)",
      },
    );
  }, [duration, mounted, resolvedTheme, setTheme]);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={toggleTheme}
      className={cn(
        "relative cursor-pointer rounded-full h-8 w-8 border border-input bg-background shadow-xs hover:bg-accent transition-colors inline-flex items-center justify-center",
        className,
      )}
      {...props}
    >
      <Sun
        className={cn(
          "h-[1.2rem] w-[1.2rem] text-primary transition-all",
          isDark ? "-rotate-90 scale-0" : "rotate-0 scale-100",
        )}
      />
      <Moon
        className={cn(
          "absolute h-[1.2rem] w-[1.2rem] text-primary transition-all",
          isDark ? "rotate-0 scale-100" : "rotate-90 scale-0",
        )}
      />
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}

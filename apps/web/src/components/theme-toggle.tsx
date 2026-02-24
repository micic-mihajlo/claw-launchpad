"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/utils";

interface AnimatedThemeTogglerProps
  extends React.ComponentPropsWithoutRef<"button"> {
  duration?: number;
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => {
    ready: Promise<void>;
  };
};

export function ThemeToggle({
  className,
  duration = 400,
  ...props
}: AnimatedThemeTogglerProps) {
  const [isDark, setIsDark] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const updateTheme = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };

    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  const toggleTheme = useCallback(async () => {
    if (!buttonRef.current) {
      return;
    }

    const doc = document as ViewTransitionDocument;
    const nextThemeIsDark = !isDark;

    if (!doc.startViewTransition) {
      setIsDark(nextThemeIsDark);
      document.documentElement.classList.toggle("dark");
      localStorage.setItem("theme", nextThemeIsDark ? "dark" : "light");
      return;
    }

    await doc.startViewTransition(() => {
      flushSync(() => {
        setIsDark(nextThemeIsDark);
        document.documentElement.classList.toggle("dark");
        localStorage.setItem("theme", nextThemeIsDark ? "dark" : "light");
      });
    }).ready;

    const { top, left, width, height } = buttonRef.current.getBoundingClientRect();
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
  }, [duration, isDark]);

  return (
    <button
      ref={buttonRef}
      onClick={toggleTheme}
      className={cn(
        "relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-input bg-background shadow-xs transition-colors hover:bg-accent",
        className,
      )}
      type="button"
      {...props}
    >
      {isDark ? (
        <Sun className="h-[1.2rem] w-[1.2rem] text-primary" />
      ) : (
        <Moon className="h-[1.2rem] w-[1.2rem] text-primary" />
      )}
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}

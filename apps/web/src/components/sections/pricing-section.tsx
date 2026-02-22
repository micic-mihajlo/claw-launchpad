"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SectionHeader } from "@/components/section-header";
import { siteConfig } from "@/lib/config";
import { cn } from "@/lib/utils";

type PricingItem = (typeof siteConfig.pricing.pricingItems)[0] & {
  launchOfferPrice?: string;
  standardPrice?: string;
};

type Tab = "setup" | "retainer";

// ── Helpers ────────────────────────────────────────────────────────────────

function parseDollars(v: string): number {
  return parseFloat(v.replace(/[^0-9.]/g, "")) || 0;
}

function getSavingsPct(founding: string, standard: string): number {
  const f = parseDollars(founding);
  const s = parseDollars(standard);
  if (!f || !s || f >= s) return 0;
  return Math.round((1 - f / s) * 100);
}

// ── Icons ──────────────────────────────────────────────────────────────────

function RemoteIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function OnSiteIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function RetainerIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

// Single-path check — no circle wrapper, secondary color
function FeatureCheck() {
  return (
    <svg
      width="13"
      height="10"
      viewBox="0 0 13 10"
      fill="none"
      className="shrink-0 mt-[3px] text-secondary"
      aria-hidden="true"
    >
      <path
        d="M1.5 5L5 8.5L11.5 1.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Tier metadata ──────────────────────────────────────────────────────────

const TIER_META: Record<string, { icon: React.ReactNode; label: string }> = {
  "Remote Implementation": {
    icon: <RemoteIcon />,
    label: "Remote deployment",
  },
  "In-Person Implementation": {
    icon: <OnSiteIcon />,
    label: "On-site deployment",
  },
  "Managed Care": {
    icon: <RetainerIcon />,
    label: "Ongoing operations",
  },
};

// ── Pricing card ───────────────────────────────────────────────────────────

function PricingCard({
  tier,
  delay = 0,
  formatPrice,
}: {
  tier: PricingItem;
  delay?: number;
  formatPrice: (v: string) => string;
}) {
  const meta = TIER_META[tier.name] ?? { icon: null, label: tier.name };
  const foundingPrice = tier.launchOfferPrice ?? tier.price;
  const hasDiscount = !!(tier.launchOfferPrice && tier.standardPrice);
  const pct = hasDiscount
    ? getSavingsPct(tier.launchOfferPrice!, tier.standardPrice!)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn(
        "rounded-2xl flex flex-col relative overflow-hidden transition-all duration-300",
        tier.isPopular
          ? [
              "bg-[#f8fbff] dark:bg-[#161b28]",
              "shadow-[0_0_0_1.5px_rgba(43,127,255,0.4),0_20px_56px_-12px_rgba(43,127,255,0.12),0_4px_16px_-4px_rgba(43,127,255,0.08)]",
              "hover:-translate-y-1.5",
              "hover:shadow-[0_0_0_1.5px_rgba(43,127,255,0.55),0_32px_72px_-12px_rgba(43,127,255,0.20),0_6px_24px_-4px_rgba(43,127,255,0.12)]",
            ].join(" ")
          : [
              "bg-white dark:bg-[#1c1c20]",
              "border border-black/[0.07] dark:border-white/[0.07]",
              "shadow-[0_1px_4px_0_rgba(0,0,0,0.05),0_1px_2px_-1px_rgba(0,0,0,0.04)]",
              "hover:-translate-y-1",
              "hover:shadow-[0_8px_40px_-8px_rgba(0,0,0,0.10),0_2px_8px_-2px_rgba(0,0,0,0.06)]",
            ].join(" "),
      )}
    >
      {/* Popular: vivid top gradient line */}
      {tier.isPopular && (
        <div className="h-[1.5px] bg-gradient-to-r from-secondary/10 via-secondary to-secondary/10" />
      )}

      <div className="flex flex-col p-6 flex-1">
        {/* ── Header: icon + label + recommended ── */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "size-10 rounded-xl flex items-center justify-center shrink-0",
                tier.isPopular
                  ? "bg-secondary/[0.12] dark:bg-secondary/[0.18] text-secondary"
                  : "bg-black/[0.055] dark:bg-white/[0.07] text-foreground/50",
              )}
            >
              {meta.icon}
            </div>
            <p className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              {meta.label}
            </p>
          </div>
          {tier.isPopular && (
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-secondary bg-secondary/[0.10] dark:bg-secondary/[0.15] px-2.5 py-[5px] rounded-full shrink-0">
              Recommended
            </span>
          )}
        </div>

        {/* ── Price block ── */}
        <div className="mb-6">
          <div className="flex items-end gap-3 flex-wrap mb-1">
            <motion.span
              className="text-[3.25rem] font-black leading-none tracking-[-0.04em] tabular-nums"
              initial={{ opacity: 0, filter: "blur(8px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.32, delay: delay + 0.1 }}
            >
              {formatPrice(foundingPrice)}
            </motion.span>
            {hasDiscount && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[15px] text-muted-foreground/40 line-through tabular-nums font-medium">
                  {formatPrice(tier.standardPrice!)}
                </span>
                {pct > 0 && (
                  <span className="text-[11px] font-bold text-secondary bg-secondary/[0.10] dark:bg-secondary/[0.18] px-2 py-[3px] rounded-full">
                    Save {pct}%
                  </span>
                )}
              </div>
            )}
          </div>
          {hasDiscount && (
            <p className="text-[11px] text-muted-foreground/35 mt-0.5 tracking-tight">
              {formatPrice(tier.standardPrice!)} standard after launch window
            </p>
          )}
        </div>

        {/* ── Thin rule ── */}
        <div className="h-px bg-black/[0.06] dark:bg-white/[0.06] mb-5" />

        {/* ── Description ── */}
        <p className="text-[13px] text-muted-foreground/80 leading-relaxed mb-5">
          {tier.description}
        </p>

        {/* ── Features — flex-1 pins CTA to bottom ── */}
        <ul className="flex flex-col gap-[11px] flex-1 mb-6">
          {tier.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5">
              <FeatureCheck />
              <span className="text-[13px] text-foreground/70 leading-snug">
                {feature}
              </span>
            </li>
          ))}
        </ul>

        {/* ── CTA ── */}
        <div className="flex flex-col gap-2.5">
          <button
            className={cn(
              "h-11 w-full flex items-center justify-center text-[13px] font-semibold tracking-tight rounded-full px-4 cursor-pointer transition-all duration-200 active:scale-[0.98]",
              tier.isPopular
                ? `${tier.buttonColor} shadow-[0_6px_20px_-4px_rgba(43,127,255,0.45)] hover:shadow-[0_10px_28px_-4px_rgba(43,127,255,0.55)] hover:-translate-y-0.5`
                : `${tier.buttonColor} shadow-[0_1px_3px_0_rgba(0,0,0,0.12),0_1px_2px_-1px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.14)]`,
            )}
          >
            {tier.buttonText}
          </button>

          {/* Founding whisper */}
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/38 tracking-tight">
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              fill="currentColor"
              className="text-secondary/50"
              aria-hidden="true"
            >
              <path d="M4 0L5 3H8L5.5 5L6.5 8L4 6L1.5 8L2.5 5L0 3H3L4 0Z" />
            </svg>
            Founding offer · 5 spots remaining
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ── Section ────────────────────────────────────────────────────────────────

export function PricingSection() {
  const [activeTab, setActiveTab] = useState<Tab>("setup");
  const formatPrice = (value: string) => value.replace(/\s*CAD/gi, "").trim();

  const setupTiers = siteConfig.pricing.pricingItems.filter((t) =>
    t.name.includes("Implementation"),
  ) as PricingItem[];

  const retainerTier = siteConfig.pricing.pricingItems.find(
    (t) => t.name === "Managed Care",
  ) as PricingItem | undefined;

  const tabs: { id: Tab; label: string }[] = [
    { id: "setup", label: "Get Started" },
    { id: "retainer", label: "Managed Care" },
  ];

  return (
    <section
      id="pricing"
      className="flex flex-col items-center justify-center gap-10 pb-10 w-full relative"
    >
      <SectionHeader>
        <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance">
          {siteConfig.pricing.title}
        </h2>
        <p className="text-muted-foreground text-center text-balance font-medium">
          {siteConfig.pricing.description}
        </p>
      </SectionHeader>

      <div className="flex flex-col items-center gap-4">
        {/* Spring-animated tab switcher */}
        <div className="flex items-center gap-0.5 p-1 rounded-full bg-black/[0.04] dark:bg-white/[0.04] border border-black/[0.07] dark:border-white/[0.07]">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="relative px-5 py-2 rounded-full text-sm font-medium cursor-pointer select-none"
            >
              {activeTab === id && (
                <motion.div
                  layoutId="tab-pill"
                  className="absolute inset-0 rounded-full bg-primary dark:bg-[#F0F0F3] shadow-sm"
                  transition={{ type: "spring", bounce: 0.18, duration: 0.48 }}
                />
              )}
              <span
                className={cn(
                  "relative z-10 transition-colors duration-200",
                  activeTab === id
                    ? "text-primary-foreground dark:text-[#18181b]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </span>
            </button>
          ))}
        </div>

        {/* Founding window strip */}
        <div className="flex items-center gap-2 px-4 py-[7px] rounded-full border border-secondary/20 bg-secondary/[0.05] dark:bg-secondary/[0.08] select-none">
          <span className="relative flex size-[7px] shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-55" />
            <span className="relative inline-flex size-[7px] rounded-full bg-secondary" />
          </span>
          <span className="text-[12px] font-semibold text-secondary tracking-tight">
            Founding window open
          </span>
          <span className="text-muted-foreground/30">·</span>
          <span className="text-[12px] text-muted-foreground/70 tracking-tight">
            First 5 clients · up to 23% off
          </span>
        </div>
      </div>

      {/* Cards */}
      <div className="w-full max-w-4xl mx-auto px-6">
        <AnimatePresence mode="wait">
          {activeTab === "setup" ? (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="grid grid-cols-1 min-[650px]:grid-cols-2 gap-4 items-stretch"
            >
              {setupTiers.map((tier, i) => (
                <PricingCard
                  key={tier.name}
                  tier={tier}
                  delay={i * 0.06}
                  formatPrice={formatPrice}
                />
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="retainer"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="max-w-sm mx-auto"
            >
              {retainerTier && (
                <PricingCard
                  tier={retainerTier}
                  delay={0}
                  formatPrice={formatPrice}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

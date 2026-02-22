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

// ── Icons ──────────────────────────────────────────────────────────────────

function RemoteIcon() {
  return (
    <svg
      width="18"
      height="18"
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
      width="18"
      height="18"
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
      width="18"
      height="18"
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

// ── Shared primitives ──────────────────────────────────────────────────────

function CheckIcon({ popular }: { popular: boolean }) {
  return (
    <div
      className={cn(
        "size-5 rounded-full border border-primary/20 flex items-center justify-center shrink-0 mt-0.5",
        popular && "bg-muted-foreground/40 border-border",
      )}
    >
      <div className="size-3 flex items-center justify-center">
        <svg
          width="8"
          height="7"
          viewBox="0 0 8 7"
          fill="none"
          className="block dark:hidden"
          aria-hidden="true"
        >
          <path
            d="M1.5 3.48828L3.375 5.36328L6.5 0.988281"
            stroke="#101828"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <svg
          width="8"
          height="7"
          viewBox="0 0 8 7"
          fill="none"
          className="hidden dark:block"
          aria-hidden="true"
        >
          <path
            d="M1.5 3.48828L3.375 5.36328L6.5 0.988281"
            stroke="#FAFAFA"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

// ── Pricing card ───────────────────────────────────────────────────────────

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        "rounded-3xl flex flex-col relative overflow-hidden transition-all duration-300 p-5",
        tier.isPopular
          ? "bg-accent ring-2 ring-secondary/35 shadow-[0px_20px_48px_-12px_rgba(0,0,0,0.14)] hover:-translate-y-2 hover:shadow-[0px_32px_64px_-12px_rgba(0,0,0,0.20)]"
          : "bg-[#F3F4F6] dark:bg-[#F9FAFB]/[0.02] border border-border/70 hover:-translate-y-1 hover:shadow-[0_16px_40px_-12px_rgba(0,0,0,0.10)]",
      )}
    >
      {/* Ambient highlight */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.06] bg-[radial-gradient(circle_at_70%_20%,white_0%,transparent_60%)]" />
      {tier.isPopular && (
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-secondary/65 to-transparent" />
      )}

      {/* ── Card header: icon + name/price ── */}
      <div className="flex items-start gap-3.5 mb-4 relative z-10">
        <div className="size-10 rounded-2xl bg-primary/[0.07] dark:bg-white/[0.07] flex items-center justify-center text-foreground/60 shrink-0 mt-0.5">
          {meta.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-base font-semibold tracking-tight leading-none">
              {meta.label}
            </p>
            {tier.isPopular && (
              <span className="bg-gradient-to-b from-secondary/50 from-[1.92%] to-secondary to-[100%] text-white h-5 inline-flex shrink-0 items-center px-2.5 rounded-full text-[10px] font-semibold tracking-wide shadow-[0px_0px_0px_1px_rgba(255,255,255,0.14)_inset]">
                Recommended
              </span>
            )}
          </div>

          {/* Price row */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <motion.span
              className="text-[2rem] font-bold leading-none tracking-tighter tabular-nums"
              initial={{ opacity: 0, filter: "blur(4px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.25, delay: delay + 0.1 }}
            >
              {formatPrice(foundingPrice)}
            </motion.span>
            {hasDiscount && (
              <span className="text-sm text-muted-foreground line-through opacity-45 tabular-nums font-medium pb-0.5">
                {formatPrice(tier.standardPrice!)}
              </span>
            )}
          </div>
          {hasDiscount && (
            <p className="text-[11px] text-muted-foreground/45 mt-0.5">
              {formatPrice(tier.standardPrice!)} after launch window
            </p>
          )}
        </div>
      </div>

      {/* ── Description ── */}
      <p className="text-[13px] text-muted-foreground leading-relaxed mb-4 relative z-10">
        {tier.description}
      </p>

      {/* ── Features — flex-1 keeps CTA pinned to bottom ── */}
      <ul className="space-y-2 flex-1 mb-5 relative z-10">
        {tier.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5">
            <CheckIcon popular={tier.isPopular} />
            <span className="text-sm leading-snug">{feature}</span>
          </li>
        ))}
      </ul>

      {/* ── Founding badge + CTA ── */}
      <div className="flex flex-col gap-2.5 relative z-10">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-md bg-secondary/[0.09] dark:bg-secondary/20 border border-secondary/20 dark:border-secondary/30 text-secondary text-[10px] font-bold uppercase tracking-[0.18em]">
            <svg
              width="7"
              height="7"
              viewBox="0 0 8 8"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M4 0L5 3H8L5.5 5L6.5 8L4 6L1.5 8L2.5 5L0 3H3L4 0Z" />
            </svg>
            Founding offer
          </span>
          <span className="text-[11px] text-muted-foreground/50">5 spots</span>
        </div>

        <button
          className={cn(
            "h-10 w-full flex items-center justify-center text-sm font-medium tracking-wide rounded-full px-4 cursor-pointer transition-all ease-out active:scale-[0.97]",
            tier.isPopular
              ? `${tier.buttonColor} shadow-[0_10px_24px_-8px_rgba(43,127,255,0.50)] hover:-translate-y-0.5 duration-200`
              : `${tier.buttonColor} shadow-[0px_1px_2px_0px_rgba(255,255,255,0.16)_inset,0px_3px_3px_-1.5px_rgba(16,24,40,0.22),0px_1px_1px_-0.5px_rgba(16,24,40,0.18)]`,
          )}
        >
          {tier.buttonText}
        </button>
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

      <div className="flex flex-col items-center gap-5">
        {/* Tab switcher */}
        <div className="flex items-center gap-1 p-1 rounded-full bg-muted/60 dark:bg-white/[0.04] border border-border/60">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "px-5 py-1.5 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer",
                activeTab === id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Founding window strip */}
        <div className="flex items-center gap-2.5 px-4 py-2 rounded-full border border-secondary/20 bg-secondary/[0.06] dark:bg-secondary/10 select-none">
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-55" />
            <span className="relative inline-flex size-2 rounded-full bg-secondary" />
          </span>
          <span className="font-semibold text-secondary text-[13px] tracking-tight">
            Founding window open
          </span>
          <span className="text-border dark:text-border">·</span>
          <span className="text-muted-foreground text-[13px]">
            First 5 clients · up to 23% off standard
          </span>
        </div>
      </div>

      {/* Cards */}
      <div className="w-full max-w-6xl mx-auto px-6">
        <AnimatePresence mode="wait">
          {activeTab === "setup" ? (
            <motion.div
              key="setup"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="grid grid-cols-1 min-[650px]:grid-cols-2 gap-4 items-stretch"
            >
              {setupTiers.map((tier, i) => (
                <PricingCard
                  key={tier.name}
                  tier={tier}
                  delay={i * 0.07}
                  formatPrice={formatPrice}
                />
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="retainer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="max-w-lg mx-auto"
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

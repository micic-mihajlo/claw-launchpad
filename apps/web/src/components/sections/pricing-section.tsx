"use client";

import { SectionHeader } from "@/components/section-header";
import { siteConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";

type PricingItem = (typeof siteConfig.pricing.pricingItems)[0] & {
  launchOfferPrice?: string;
  standardPrice?: string;
};

export function PricingSection() {
  const formatPrice = (value: string) =>
    value.replace(/\s*CAD/gi, "").trim();

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

      {/* Founding window status strip */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        className="flex items-center gap-2.5 px-4 py-2 rounded-full border border-secondary/20 bg-secondary/[0.06] dark:bg-secondary/10 select-none"
      >
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
      </motion.div>

      <div className="relative w-full">
        {/*
          items-stretch: explicit — CSS grid stretches all cards to the
          tallest sibling in each row. Combined with flex-col + grow on
          the features section, this ensures equal-height cards.
        */}
        <div className="grid min-[650px]:grid-cols-2 min-[900px]:grid-cols-3 gap-4 w-full max-w-6xl mx-auto px-6 items-stretch">
          {siteConfig.pricing.pricingItems.map((tier, i) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08, ease: [0.4, 0, 0.2, 1] }}
              className={cn(
                // flex-col: enables grow on inner sections for equal height
                "rounded-3xl flex flex-col relative overflow-hidden transition-all duration-300",
                tier.isPopular
                  ? "bg-accent ring-2 ring-secondary/35 shadow-[0px_20px_48px_-12px_rgba(0,0,0,0.14)] hover:-translate-y-2 hover:shadow-[0px_32px_64px_-12px_rgba(0,0,0,0.20)]"
                  : "bg-[#F3F4F6] dark:bg-[#F9FAFB]/[0.02] border border-border/70 hover:-translate-y-1 hover:shadow-[0_16px_40px_-12px_rgba(0,0,0,0.10)]",
              )}
            >
              {/* Radial ambient highlight */}
              <div className="absolute inset-0 pointer-events-none opacity-[0.06] bg-[radial-gradient(circle_at_70%_20%,white_0%,transparent_60%)]" />

              {/* Top gradient line — recommended card only */}
              {tier.isPopular && (
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-secondary/65 to-transparent" />
              )}

              {/* ── Card header ── */}
              <div className="flex flex-col gap-4 p-5 relative z-10">
                {/* Tier label row */}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground leading-none">
                    {tier.name}
                  </p>
                  {tier.isPopular && (
                    <span className="bg-gradient-to-b from-secondary/50 from-[1.92%] to-secondary to-[100%] text-white h-5 inline-flex shrink-0 items-center px-2.5 rounded-full text-[10px] font-semibold tracking-wide shadow-[0px_4px_8px_-2px_rgba(0,0,0,0.12),0px_0px_0px_1px_rgba(255,255,255,0.14)_inset]">
                      Recommended
                    </span>
                  )}
                </div>

                {/* Service label + description */}
                <div>
                  <p className="text-xl font-semibold tracking-tight leading-snug">
                    {tier.name === "Remote Implementation"
                      ? "Remote deployment"
                      : tier.name === "In-Person Implementation"
                        ? "On-site deployment"
                        : "Ongoing operations"}
                  </p>
                  <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">
                    {tier.description}
                  </p>
                </div>

                {/* ── Price block ── */}
                <div className="flex flex-col gap-0.5 pt-1 border-t border-border/50 dark:border-white/[0.06]">
                  {/* Founding badge */}
                  <div className="flex items-center gap-2 mb-2 mt-3">
                    <span className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-md bg-secondary/[0.09] dark:bg-secondary/20 border border-secondary/20 dark:border-secondary/30 text-secondary text-[10px] font-bold uppercase tracking-[0.2em]">
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
                    <span className="text-[11px] text-muted-foreground/50 font-medium">
                      5 spots
                    </span>
                  </div>

                  {/* Founding price + strikethrough standard */}
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <motion.span
                      key={`${tier.name}-price`}
                      className="text-[2.625rem] md:text-5xl font-bold leading-none tracking-tighter tabular-nums"
                      initial={{ opacity: 0, filter: "blur(5px)" }}
                      animate={{ opacity: 1, filter: "blur(0px)" }}
                      transition={{ duration: 0.28, delay: i * 0.08 + 0.14 }}
                    >
                      {(tier as PricingItem).launchOfferPrice
                        ? formatPrice((tier as PricingItem).launchOfferPrice!)
                        : formatPrice(tier.price)}
                    </motion.span>
                    {(tier as PricingItem).standardPrice &&
                      (tier as PricingItem).launchOfferPrice && (
                        <span className="text-sm text-muted-foreground line-through pb-1 opacity-45 tabular-nums font-medium">
                          {formatPrice((tier as PricingItem).standardPrice!)}
                        </span>
                      )}
                  </div>

                  {/* Standard rate footnote */}
                  {(tier as PricingItem).standardPrice &&
                    (tier as PricingItem).launchOfferPrice && (
                      <p className="text-[11px] text-muted-foreground/45 mt-1">
                        {formatPrice((tier as PricingItem).standardPrice!)} after launch window
                      </p>
                    )}
                </div>
              </div>

              {/* ── CTA ── */}
              <div className="px-5 pb-5 relative z-10">
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

              {/* ── Divider ── */}
              <hr className="border-border dark:border-white/[0.07] mx-5" />

              {/* ── Feature list ── grow fills remaining height so all cards align */}
              <div className="p-5 grow relative z-10">
                <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground/45 mb-3.5">
                  Includes
                </p>
                <ul className="space-y-2.5">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <div
                        className={cn(
                          "size-5 rounded-full border border-primary/20 flex items-center justify-center shrink-0 mt-0.5",
                          tier.isPopular && "bg-muted-foreground/40 border-border",
                        )}
                      >
                        <div className="size-3 flex items-center justify-center">
                          <svg
                            width="8"
                            height="7"
                            viewBox="0 0 8 7"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
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
                            xmlns="http://www.w3.org/2000/svg"
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
                      <span className="text-sm leading-snug">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

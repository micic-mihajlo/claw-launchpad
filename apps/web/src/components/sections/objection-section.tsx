"use client";

import { motion } from "motion/react";
import {
  Clock,
  Shield,
  Wrench,
  HardDrive,
  AlertCircle,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { cn } from "@/lib/utils";

interface Row {
  icon: LucideIcon;
  label: string;
  diy: string;
  ours: string;
}

const rows: Row[] = [
  {
    icon: Clock,
    label: "Time to first agent",
    diy: "3–6 weeks of DevOps",
    ours: "Live in one day",
  },
  {
    icon: Shield,
    label: "Security hardening",
    diy: "You research and configure it",
    ours: "Hardened by default, per workload",
  },
  {
    icon: Wrench,
    label: "Ongoing maintenance",
    diy: "Your team owns every update",
    ours: "We handle updates, monitoring, uptime",
  },
  {
    icon: HardDrive,
    label: "Data residency",
    diy: "Shared cloud by default",
    ours: "Your hardware, full control",
  },
  {
    icon: AlertCircle,
    label: "Incident response",
    diy: "You debug at midnight",
    ours: "Named contact, proactive alerts",
  },
  {
    icon: Layers,
    label: "Scaling agents",
    diy: "Re-architect every time",
    ours: "Clean isolation, add agents without rework",
  },
];

export function ObjectionSection() {
  return (
    <section
      id="objection"
      className="flex flex-col items-center justify-center gap-10 pb-10 w-full relative"
    >
      <SectionHeader>
        <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance">
          Deployed in a Day, Not a Sprint
        </h2>
        <p className="text-muted-foreground text-center text-balance font-medium">
          What the DIY path actually costs — and what we absorb instead.
        </p>
      </SectionHeader>

      <div className="w-full max-w-5xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
          className="rounded-2xl overflow-hidden border border-black/[0.07] dark:border-white/[0.07] shadow-[0_1px_4px_0_rgba(0,0,0,0.05),0_1px_2px_-1px_rgba(0,0,0,0.04)]"
        >
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_1px_1fr]">
            <div className="px-6 py-4 bg-white dark:bg-[#1c1c20]">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/40">
                On your own
              </p>
            </div>
            <div className="bg-black/[0.06] dark:bg-white/[0.06]" />
            <div className="relative px-6 py-4 bg-[#f8fbff] dark:bg-[#161b28]">
              <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-secondary/10 via-secondary to-secondary/10" />
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-secondary">
                With Hivemind
              </p>
            </div>
          </div>

          {/* Rows */}
          {rows.map((row, index) => {
            const Icon = row.icon;
            const isLast = index === rows.length - 1;
            return (
              <div
                key={row.label}
                className={cn(
                  "grid grid-cols-[1fr_1px_1fr]",
                  !isLast &&
                    "border-t border-black/[0.05] dark:border-white/[0.05]",
                )}
              >
                <div className="flex items-start gap-3 px-6 py-4 bg-white dark:bg-[#1c1c20]">
                  <Icon className="size-4 text-muted-foreground/25 mt-[3px] shrink-0" />
                  <div className="flex flex-col gap-0.5">
                    <p className="text-[11px] font-semibold text-muted-foreground/40 tracking-tight">
                      {row.label}
                    </p>
                    <p className="text-[13px] text-muted-foreground/60">
                      {row.diy}
                    </p>
                  </div>
                </div>
                <div className="bg-black/[0.06] dark:bg-white/[0.06]" />
                <div className="flex items-start px-6 py-4 bg-[#f8fbff] dark:bg-[#161b28]">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-[11px] font-semibold text-secondary/50 tracking-tight">
                      {row.label}
                    </p>
                    <p className="text-[13px] text-foreground font-medium">
                      {row.ours}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SectionHeader } from "@/components/section-header";
import { cn } from "@/lib/utils";
import {
  Mail,
  CalendarDays,
  Database,
  FileText,
  LayoutList,
  BarChart2,
  type LucideIcon,
} from "lucide-react";

interface UseCase {
  id: number;
  icon: LucideIcon;
  title: string;
  description: string;
  tools: string[];
  output: string;
}

const useCases: UseCase[] = [
  {
    id: 1,
    icon: Mail,
    title: "Inbox Triage",
    description:
      "Reads, labels, and drafts replies for your highest-priority emails before you open your laptop.",
    tools: ["Gmail", "Notion"],
    output:
      "3 investor threads flagged · 2 follow-ups drafted · 41 newsletters archived · 8 items labeled",
  },
  {
    id: 2,
    icon: CalendarDays,
    title: "Meeting Prep",
    description:
      "Pulls attendee history, open action items, and a pre-read brief into your calendar event before every call.",
    tools: ["Calendar", "Notion", "Slack"],
    output:
      "Brief ready 15 min before call · 3 open action items surfaced · Agenda posted to thread",
  },
  {
    id: 3,
    icon: Database,
    title: "CRM Updates",
    description:
      "Logs call notes, moves deal stages, and sends follow-up summaries without anyone touching Salesforce.",
    tools: ["Salesforce", "Gmail", "Slack"],
    output:
      "4 deals updated · 2 follow-up emails sent · Pipeline report posted to #sales",
  },
  {
    id: 4,
    icon: FileText,
    title: "Content Scheduling",
    description:
      "Drafts posts from briefs, routes for review, and queues them for publish — completely hands-free.",
    tools: ["Notion", "Drive", "Slack"],
    output:
      "3 drafts ready for review · Tuesday queue confirmed · Slack summary posted to #content",
  },
  {
    id: 5,
    icon: LayoutList,
    title: "Ticket Triage",
    description:
      "Reads incoming issues, routes to the right person, and posts a daily blocker digest to the team.",
    tools: ["Linear", "Slack", "GitHub"],
    output:
      "8 tickets routed · 2 blockers escalated · Daily digest posted at 9:00am",
  },
  {
    id: 6,
    icon: BarChart2,
    title: "Weekly Reports",
    description:
      "Compiles KPIs, highlights, and blockers from across your tools into a send-ready summary every Friday.",
    tools: ["Notion", "Drive", "Slack"],
    output:
      "Report compiled from 6 sources · Sent to 3 stakeholders · 4 actions flagged",
  },
];

export function UseCasesSection() {
  const [active, setActive] = useState(0);
  const current = useCases[active];
  const Icon = current.icon;

  return (
    <section
      id="use-cases"
      className="flex flex-col items-center justify-center w-full relative px-5 md:px-10"
    >
      <div className="border-x mx-5 md:mx-10 relative w-full">
        <div className="absolute top-0 -left-4 md:-left-14 h-full w-4 md:w-14 text-primary/5 bg-[size:10px_10px] [background-image:repeating-linear-gradient(315deg,currentColor_0_1px,#0000_0_50%)]" />
        <div className="absolute top-0 -right-4 md:-right-14 h-full w-4 md:w-14 text-primary/5 bg-[size:10px_10px] [background-image:repeating-linear-gradient(315deg,currentColor_0_1px,#0000_0_50%)]" />

        <SectionHeader>
          <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance">
            What Your Agents Handle
          </h2>
          <p className="text-muted-foreground text-center text-balance font-medium">
            Real automation, running before your team starts their day.
          </p>
        </SectionHeader>

        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] border-t border-border overflow-hidden">
          {/* Left: tab list */}
          <div className="md:border-r border-border flex flex-row md:flex-col overflow-x-auto md:overflow-visible scrollbar-none">
            {useCases.map((useCase, index) => {
              const ItemIcon = useCase.icon;
              const isActive = active === index;
              return (
                <button
                  key={useCase.id}
                  onClick={() => setActive(index)}
                  className={cn(
                    "relative flex-shrink-0 md:flex-shrink md:w-full flex items-center gap-3 px-5 py-4 text-left transition-colors duration-200 border-r md:border-r-0 md:border-b border-border last:border-r-0 md:last:border-b-0 cursor-pointer select-none",
                    isActive ? "bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="use-case-indicator"
                      className="absolute bottom-0 left-0 right-0 h-[2px] md:bottom-auto md:top-0 md:left-0 md:h-full md:w-[2px] md:right-auto bg-secondary"
                      transition={{ type: "spring", bounce: 0.18, duration: 0.38 }}
                    />
                  )}
                  <div
                    className={cn(
                      "size-8 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-200",
                      isActive
                        ? "bg-secondary/[0.12] dark:bg-secondary/[0.18] text-secondary"
                        : "bg-black/[0.05] dark:bg-white/[0.06] text-foreground/40",
                    )}
                  >
                    <ItemIcon className="size-4" />
                  </div>
                  <span
                    className={cn(
                      "text-sm font-semibold tracking-tight whitespace-nowrap md:whitespace-normal transition-colors duration-200",
                      isActive ? "text-foreground" : "text-foreground/50",
                    )}
                  >
                    {useCase.title}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right: active content panel */}
          <div className="relative min-h-[360px] bg-accent/30">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                className="flex flex-col gap-6 p-7 md:p-8 h-full"
              >
                <div className="flex items-start gap-4">
                  <div className="size-11 rounded-xl bg-secondary/[0.10] dark:bg-secondary/[0.15] text-secondary flex items-center justify-center shrink-0">
                    <Icon className="size-5" />
                  </div>
                  <div className="flex flex-col gap-2 pt-0.5">
                    <h3 className="text-xl font-semibold tracking-tight">
                      {current.title}
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {current.tools.map((tool) => (
                        <span
                          key={tool}
                          className="text-[11px] font-medium rounded-full bg-background border border-black/[0.07] dark:border-white/[0.07] px-2.5 py-0.5 text-foreground/50"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <p className="text-[15px] text-muted-foreground leading-relaxed">
                  {current.description}
                </p>

                {/* Agent output log */}
                <div className="mt-auto rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1c1c20] overflow-hidden shadow-[0_1px_4px_0_rgba(0,0,0,0.04)]">
                  <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-black/[0.05] dark:border-white/[0.05]">
                    <span className="relative flex size-[7px]">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-55" />
                      <span className="relative inline-flex size-[7px] rounded-full bg-secondary" />
                    </span>
                    <p className="text-[11px] text-muted-foreground/50 font-medium tracking-tight">
                      Last run · Today 7:02am
                    </p>
                  </div>
                  <p className="px-4 py-3.5 text-[13px] text-foreground/70 font-mono leading-relaxed tracking-tight">
                    {current.output}
                  </p>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

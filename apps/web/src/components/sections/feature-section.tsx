import { SectionHeader } from "@/components/section-header";
import { siteConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";

export function FeatureSection() {
  const { title, description, items } = siteConfig.featureSection;

  return (
    <section
      id="features"
      className="flex flex-col items-center justify-center gap-5 w-full relative"
    >
      <SectionHeader>
        <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance">
          {title}
        </h2>
        <p className="text-muted-foreground text-center text-balance font-medium">
          {description}
        </p>
      </SectionHeader>
      <div className="w-full max-w-6xl mx-auto px-6 pb-2 relative">
        <div className="pointer-events-none absolute left-10 right-10 top-8 bottom-8 rounded-[28px] border border-border/40 bg-gradient-to-b from-accent via-background to-accent" />
        <div className="pointer-events-none absolute left-1/2 top-14 bottom-14 hidden md:block w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-secondary/45 to-transparent" />

        <div className="relative grid grid-cols-1 md:grid-cols-2 gap-5 p-4 md:p-8">
          {items.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20, x: index % 2 === 0 ? -10 : 10 }}
              whileInView={{ opacity: 1, y: 0, x: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.4, delay: index * 0.07 }}
              className={cn(index % 2 === 0 ? "md:mr-3" : "md:ml-3")}
            >
              <article className="group rounded-2xl border border-border/70 bg-[#F3F4F6] dark:bg-[#1c1c20] overflow-hidden shadow-[0_1px_4px_0_rgba(0,0,0,0.05),0_1px_2px_-1px_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_18px_40px_-16px_rgba(0,0,0,0.28)]">
                <div className="relative h-40 overflow-hidden border-b border-border/60">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-tr from-black/45 via-black/20 to-transparent" />
                </div>

                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-xl tracking-tight font-semibold leading-tight">
                      {item.title}
                    </h3>
                    <ArrowUpRight className="size-4 text-muted-foreground mt-1 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                  <p className="text-muted-foreground mt-2.5 leading-relaxed">
                    {item.content}
                  </p>
                </div>
              </article>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

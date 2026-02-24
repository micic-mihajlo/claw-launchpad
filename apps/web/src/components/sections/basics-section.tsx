import { SectionHeader } from "@/components/section-header";
import { siteConfig } from "@/lib/config";

export function BasicsSection() {
  const { basicsSection } = siteConfig;

  return (
    <section
      id="basics"
      className="flex flex-col items-center justify-center w-full relative px-5 md:px-10"
    >
      <div className="border-x mx-5 md:mx-10 relative">
        <div className="absolute top-0 -left-4 md:-left-14 h-full w-4 md:w-14 text-primary/5 bg-[size:10px_10px] [background-image:repeating-linear-gradient(315deg,currentColor_0_1px,#0000_0_50%)]"></div>
        <div className="absolute top-0 -right-4 md:-right-14 h-full w-4 md:w-14 text-primary/5 bg-[size:10px_10px] [background-image:repeating-linear-gradient(315deg,currentColor_0_1px,#0000_0_50%)]"></div>

      <SectionHeader>
        <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance">
          {basicsSection.title}
        </h2>
        <p className="text-muted-foreground text-center text-balance font-medium">
          {basicsSection.description}
        </p>
      </SectionHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-x divide-border">
        {basicsSection.items.map((item) => (
          <div
            key={item.title}
            className="flex flex-col gap-3 p-6 min-h-[260px] md:min-h-[280px]"
          >
            <h3 className="text-lg tracking-tighter font-semibold">
              {item.title}
            </h3>
            <p className="text-muted-foreground">{item.description}</p>
            <ul className="space-y-2 pt-2">
              {item.keyPoints.map((point) => (
                <li key={point} className="flex items-center gap-2 text-sm">
                  <div className="size-5 rounded-full border border-primary/20 flex items-center justify-center">
                    <div className="size-3 flex items-center justify-center">
                      <svg
                        width="8"
                        height="7"
                        viewBox="0 0 8 7"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="block dark:hidden"
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
                  <span className="text-muted-foreground leading-snug">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        </div>
      </div>
    </section>
  );
}

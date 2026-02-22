import { HeroSection } from "@/components/sections/hero-section";
import { CompanyShowcase } from "@/components/sections/company-showcase";
import { Navbar } from "@/components/sections/navbar";
import { BentoSection } from "@/components/sections/bento-section";
import { QuoteSection } from "@/components/sections/quote-section";
import { BasicsSection } from "@/components/sections/basics-section";
import { FeatureSection } from "@/components/sections/feature-section";
import { GrowthSection } from "@/components/sections/growth-section";
import { PricingSection } from "@/components/sections/pricing-section";
import { TestimonialSection } from "@/components/sections/testimonial-section";
import { FAQSection } from "@/components/sections/faq-section";
import { CTASection } from "@/components/sections/cta-section";
import { FooterSection } from "@/components/sections/footer-section";

export function PublicLanding() {
  return (
    <>
      <div className="max-w-7xl mx-auto border-x relative">
        <div className="block w-px h-full border-l border-border absolute top-0 left-6 z-10"></div>
        <div className="block w-px h-full border-r border-border absolute top-0 right-6 z-10"></div>
        <Navbar />
        <main className="flex flex-col items-center justify-center divide-y divide-border min-h-screen w-full">
          <HeroSection />
          <CompanyShowcase />
          <BentoSection />
          <QuoteSection />
          <BasicsSection />
          <FeatureSection />
          <GrowthSection />
          <PricingSection />
          <TestimonialSection />
          <FAQSection />
          <CTASection />
          <FooterSection />
        </main>
      </div>
    </>
  );
}

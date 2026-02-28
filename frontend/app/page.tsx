import { LandingNav } from "@/components/landing/nav";
import { Hero } from "@/components/landing/hero";
import { MarqueeStrip } from "@/components/landing/marquee";
import { HowItWorks } from "@/components/landing/how-it-works";
import { ImpactNumbers } from "@/components/landing/impact-numbers";
import { UseCases } from "@/components/landing/use-cases";
import { Features } from "@/components/landing/features";
import { Manifesto } from "@/components/landing/manifesto";
import { CtaSection } from "@/components/landing/cta-section";
import { Footer } from "@/components/landing/footer";
import { CursorGlow } from "@/components/landing/cursor-glow";

export default function LandingPage() {
  return (
    <div className="bg-[var(--l-bg)] min-h-screen">
      <CursorGlow />
      <LandingNav />
      <Hero />
      <MarqueeStrip />
      <HowItWorks />
      <ImpactNumbers />
      <UseCases />
      <Features />
      <Manifesto />
      <CtaSection />
      <Footer />
    </div>
  );
}

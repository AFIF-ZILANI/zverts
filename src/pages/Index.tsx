import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/zerod/AppShell";
import { ArrowRight, Lock, Activity, Award, ShieldCheck } from "lucide-react";

const Index = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <AppShell>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-hero" />
        <div className="absolute inset-0 bg-grid opacity-40" />
        <div className="container relative py-24 md:py-36">
          <div className="max-w-3xl animate-fade-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 backdrop-blur px-3 py-1 text-xs font-mono uppercase tracking-widest text-muted-foreground mb-8">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-glow" />
              Free · Sequential · Verified
            </div>
            <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-semibold leading-[0.95] tracking-tight text-balance">
              Learn with<br/>
              <span className="italic text-primary">discipline</span>,<br/>
              not distraction.
            </h1>
            <p className="mt-8 text-lg md:text-xl text-muted-foreground max-w-xl text-balance">
              ZeroD Academy locks every module behind the previous one. Watch <span className="text-foreground font-medium">90% or mark complete</span> to advance. No skipping. No shortcuts. Just earned progress.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link to="/auth">
                <Button size="lg" className="bg-gradient-lime text-primary-foreground hover:opacity-90 shadow-glow font-semibold">
                  Start free <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <a href="#how" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-mono">
                How it works ↓
              </a>
            </div>
            <div className="mt-12 flex flex-wrap gap-x-8 gap-y-3 font-mono text-xs text-muted-foreground">
              <span>16 MODULES</span>
              <span className="text-border">/</span>
              <span>~60 HRS CONTENT</span>
              <span className="text-border">/</span>
              <span>0 COST</span>
            </div>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section id="how" className="container py-24">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { icon: Lock, title: "Sequential unlock", body: "Each module opens only after you complete the previous. Backend-validated, no API bypass." },
            { icon: Activity, title: "Real watch tracking", body: "We track your watch time every 5 seconds and require 90% to auto-complete." },
            { icon: ShieldCheck, title: "Honest progress", body: "Server-side validation prevents fake completions. Your dashboard reflects real work." },
            { icon: Award, title: "Earned certificate", body: "Finish every module and download a certificate that means something." },
          ].map((p) => (
            <div key={p.title} className="rounded-xl border border-border bg-gradient-card p-6 shadow-card hover:border-primary/30 transition-colors">
              <p.icon className="h-5 w-5 text-primary" />
              <h3 className="font-display text-xl mt-4">{p.title}</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container pb-32">
        <div className="rounded-2xl border border-border bg-gradient-card p-10 md:p-16 shadow-elevated text-center">
          <h2 className="font-display text-3xl md:text-5xl font-semibold tracking-tight text-balance">
            Ready to actually finish a course?
          </h2>
          <p className="mt-4 text-muted-foreground max-w-md mx-auto">
            Sign in with Google. Start Module 01. Earn the rest.
          </p>
          <Link to="/auth" className="inline-block mt-8">
            <Button size="lg" className="bg-gradient-lime text-primary-foreground hover:opacity-90 shadow-glow font-semibold">
              Begin Module 01 <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </AppShell>
  );
};

export default Index;

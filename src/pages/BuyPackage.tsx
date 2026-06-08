import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { PACKAGES, PackageKey } from "@/lib/payment-config";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Check, Zap, Sparkles, Coins, ShieldCheck } from "lucide-react";

const ORDER: PackageKey[] = ["single", "mini", "pro"];

const BuyPackage = () => {
    const { user, loading } = useAuth();
    const ent = useEntitlements();
    if (loading) return null;
    if (!user) return <Navigate to="/auth" replace />;

    return (
        <AppShell>
            <section className="container py-10 md:py-14 max-w-6xl space-y-10">
                {/* Header */}
                <div>
                    <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                        / buy convert pack
                    </div>
                    <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight mt-2">
                        Unlock more conversions
                    </h1>
                    <p className="text-muted-foreground mt-3 max-w-2xl">
                        One-time payment. Credits never expire. First purchase also unlocks{" "}
                        <span className="text-primary font-medium">AI Tutor for lifetime</span>.
                    </p>
                </div>

                {/* Current status bar */}
                <div className="rounded-2xl border border-border bg-card p-5 flex flex-wrap gap-6">
                    <div className="flex items-center gap-2 text-sm">
                        <Coins className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">Free conversions:</span>
                        <span className="font-semibold">
                            {ent.free_left > 0 ? (
                                <span className="text-primary">{ent.free_left} remaining</span>
                            ) : (
                                <span className="text-destructive">None left</span>
                            )}
                            <span className="text-muted-foreground font-normal"> of 3</span>
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <Coins className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-muted-foreground">Convert credits:</span>
                        <span className="font-semibold text-primary">{ent.convert_credits}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <Sparkles
                            className={`h-4 w-4 shrink-0 ${ent.ai_enabled ? "text-primary" : "text-muted-foreground"}`}
                        />
                        <span className="text-muted-foreground">AI Tutor:</span>
                        <span
                            className={`font-semibold ${ent.ai_enabled ? "text-primary" : "text-muted-foreground"}`}
                        >
                            {ent.ai_enabled ? "Unlocked ✨" : "Locked"}
                        </span>
                    </div>
                </div>

                {/* Package cards */}
                <div className="grid md:grid-cols-3 gap-6">
                    {ORDER.map((key) => {
                        const p = PACKAGES[key];
                        const popular = key === "pro";
                        return (
                            <div
                                key={key}
                                className={`relative rounded-2xl border p-6 shadow-card flex flex-col gap-6 transition-all ${
                                    popular
                                        ? "border-primary bg-gradient-card shadow-glow"
                                        : "border-border bg-card hover:border-primary/40"
                                }`}
                            >
                                {popular && (
                                    <div className="absolute -top-3 left-6 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-mono uppercase tracking-wider">
                                        Best value
                                    </div>
                                )}

                                <div>
                                    <div className="font-display text-2xl">{p.name}</div>
                                    <div className="text-xs font-mono text-muted-foreground mt-1">
                                        {p.tagline}
                                    </div>
                                </div>

                                <div className="flex items-baseline gap-1">
                                    <span className="font-display text-5xl font-bold">
                                        {p.price}
                                    </span>
                                    <span className="text-muted-foreground text-lg">Tk</span>
                                </div>

                                <ul className="space-y-2.5 text-sm flex-1">
                                    <li className="flex items-start gap-2">
                                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                                        <span>
                                            {p.credits} playlist convert{p.credits > 1 ? "s" : ""}
                                        </span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                                        <span>AI Tutor unlocked for life</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <Zap className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                                        <span>Credits never expire</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                                        <span>Manual approval · secure</span>
                                    </li>
                                </ul>

                                <Link to={`/payment?pkg=${key}`}>
                                    <Button
                                        className={`w-full ${popular ? "bg-gradient-lime text-primary-foreground shadow-glow" : ""}`}
                                        variant={popular ? "default" : "outline"}
                                    >
                                        Buy now
                                    </Button>
                                </Link>
                            </div>
                        );
                    })}
                </div>

                {/* Footer note */}
                <div className="text-center text-xs text-muted-foreground font-mono space-y-1 pb-4">
                    <div>Need help? Payment is reviewed manually within a few hours.</div>
                    <div>
                        By making a payment you agree to the{" "}
                        <Link to="/refund-policy" className="text-primary hover:underline">
                            ZverTs Refund Policy
                        </Link>
                        .
                    </div>
                </div>
            </section>
        </AppShell>
    );
};
export default BuyPackage;

import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/zerod/AppShell";
import { Button } from "@/components/ui/button";
import { lovable } from "@/integrations/lovable";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

const Auth = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  const signInGoogle = async () => {
    setBusy(true);
    const { error } = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/dashboard` });
    if (error) {
      toast.error(error.message || "Sign-in failed");
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <section className="container py-24 max-w-md">
        <button onClick={() => navigate("/")} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-8 font-mono">
          <ArrowLeft className="h-3 w-3" /> Back
        </button>
        <div className="rounded-2xl border border-border bg-gradient-card p-10 shadow-elevated">
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-3">/ access</div>
          <h1 className="font-display text-4xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-3 text-muted-foreground">One account. One Google click. Free forever.</p>

          <Button onClick={signInGoogle} disabled={busy} variant="outline" size="lg"
            className="w-full mt-8 bg-card border-border hover:bg-secondary hover:border-primary/40 font-medium">
            <svg className="mr-3 h-5 w-5" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2c-.4.4 6.6-4.8 6.6-14.8 0-1.3-.1-2.4-.4-3.5z"/></svg>
            {busy ? "Redirecting..." : "Continue with Google"}
          </Button>

          <p className="mt-8 text-xs text-muted-foreground/70 font-mono leading-relaxed">
            By continuing you agree to learn with discipline and respect the locked-module rule. Your progress is tracked server-side.
          </p>
        </div>
      </section>
    </AppShell>
  );
};

export default Auth;

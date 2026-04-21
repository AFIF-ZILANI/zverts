import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut, LayoutDashboard, BookOpen } from "lucide-react";
import { ReactNode } from "react";

export const AppShell = ({ children }: { children: ReactNode }) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <Link to={user ? "/dashboard" : "/"} className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-lime grid place-items-center shadow-glow">
              <span className="font-display text-primary-foreground font-bold text-lg leading-none">0</span>
            </div>
            <span className="font-display text-xl font-semibold tracking-tight">ZeroD<span className="text-primary">.</span></span>
          </Link>
          {user && (
            <nav className="hidden md:flex items-center gap-1">
              <NavLink to="/dashboard" className={({isActive}) => `px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                <LayoutDashboard className="inline h-4 w-4 mr-1.5 -mt-0.5" />Dashboard
              </NavLink>
              <NavLink to="/learn" className={({isActive}) => `px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                <BookOpen className="inline h-4 w-4 mr-1.5 -mt-0.5" />Modules
              </NavLink>
            </nav>
          )}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="hidden sm:block text-sm text-muted-foreground font-mono truncate max-w-[180px]">{user.email}</span>
                <Button variant="ghost" size="sm" onClick={async () => { await signOut(); navigate("/"); }}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button variant="default" size="sm" onClick={() => navigate("/auth")}>Sign in</Button>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border/60 py-8">
        <div className="container text-xs text-muted-foreground font-mono flex items-center justify-between">
          <span>© ZeroD Academy — Disciplined learning.</span>
          <span>Free · Open · Verified</span>
        </div>
      </footer>
    </div>
  );
};

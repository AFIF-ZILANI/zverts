import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEntitlements } from "@/hooks/useEntitlements";

export const RequireRole = ({
    role,
    children,
}: {
    role: "admin" | "super_admin";
    children: ReactNode;
}) => {
    const { user, loading: authLoading } = useAuth();
    const { isAdmin, isSuperAdmin, loading } = useEntitlements();
    if (authLoading || loading) return null;
    if (!user) return <Navigate to="/auth" replace />;
    const ok = role === "super_admin" ? isSuperAdmin : isAdmin;
    if (!ok) return <Navigate to="/dashboard" replace />;
    return <>{children}</>;
};

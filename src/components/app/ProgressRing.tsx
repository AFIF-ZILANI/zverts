import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A circular progress ring with content in the middle. */
export const ProgressRing = ({
    value,
    size = 64,
    stroke = 6,
    className,
    children,
}: {
    /** 0–100 */
    value: number;
    size?: number;
    stroke?: number;
    className?: string;
    children?: ReactNode;
}) => {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(100, value));
    return (
        <div
            className={cn("relative shrink-0", className)}
            style={{ width: size, height: size }}
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
        >
            <svg width={size} height={size} className="-rotate-90">
                <defs>
                    <linearGradient id="ring-lime" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" />
                        <stop offset="100%" stopColor="hsl(var(--accent))" />
                    </linearGradient>
                </defs>
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    strokeWidth={stroke}
                    className="stroke-muted"
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    stroke="url(#ring-lime)"
                    strokeDasharray={c}
                    strokeDashoffset={c * (1 - pct / 100)}
                    className="transition-[stroke-dashoffset] duration-700 ease-out"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                {children}
            </div>
        </div>
    );
};

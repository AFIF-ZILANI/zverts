// Merchant payment numbers. Replace these placeholders with real numbers.
// Stored client-side because the form needs to display them; the actual approval
// is admin-controlled server-side (no auto-verification with these numbers).
export const MERCHANT_NUMBERS = {
    bkash: "01319711956",
    nagad: "01319711956",
    rocket: "01319711956",
} as const;

export type PackageKey = "single" | "mini" | "pro";

export const PACKAGES: Record<
    PackageKey,
    { name: string; price: number; credits: number; tagline: string }
> = {
    single: { name: "Single Convert", price: 10, credits: 1, tagline: "One-shot pack" },
    mini: { name: "Mini Pack", price: 40, credits: 5, tagline: "Best for casual creators" },
    pro: { name: "Pro Pack", price: 70, credits: 10, tagline: "Best value · save 30%" },
};

export const METHOD_LABELS = {
    bkash: "bKash",
    nagad: "Nagad",
    rocket: "Rocket",
} as const;

export const MERCHANT_NUMBERS = {
    bkash: "01341570410",
    nagad: "01341570410",
    rocket: "01341570410",
} as const;

export type PackageKey = "premium";

export const PACKAGES: Record<
    PackageKey,
    { name: string; price: number; tagline: string }
> = {
    premium: { name: "Premium", price: 179, tagline: "Monthly subscription" },
};

export const METHOD_LABELS = {
    bkash: "bKash",
    nagad: "Nagad",
    rocket: "Rocket",
} as const;

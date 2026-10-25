// Search and answer-engine facts shared by the app (SEO component, pages) and
// the build (vite.config.ts writes each public page's static HTML, the sitemap
// and robots.txt from this). Plain data: no React or browser APIs.
import { INFO_PAGES } from "./infoPages";

export const SITE = "https://www.zverts.com";
export const BRAND = "ZverTs";
/** How people mistype or shorten the name; listed as alternateName in JSON-LD. */
export const ALT_NAMES = [
    "Zverts",
    "Zvert",
    "Zvertz",
    "Z Verts",
    "Verts",
    "Zevrt",
    "Zvrts",
    "ZverTs app",
];
export const DEFAULT_IMAGE = `${SITE}/og-image.webp`;
export const LOGO = `${SITE}/android-chrome-512x512.png`;
export const EMAIL = "zvertsofficial@gmail.com";

export const HOME_TITLE = "ZverTs — Turn YouTube Playlists into Structured Courses";
export const HOME_DESCRIPTION =
    "ZverTs turns any YouTube playlist into a structured course: lessons unlock in order, real watch time is tracked, and you earn streaks, XP and a certificate. Free to start.";

export type FaqItem = { q: string; a: string };
export type Section = { h2: string; p?: string; list?: string[] };
/** A public page: what search engines get in its static HTML before the app loads. */
export type PublicPage = {
    path: string;
    title: string;
    description: string;
    h1: string;
    intro: string;
    sections?: Section[];
    faq?: FaqItem[];
    priority: number;
    changefreq: "daily" | "weekly" | "monthly" | "yearly";
};

export const PLAYLIST_FAQ: FaqItem[] = [
    {
        q: "How do I convert a YouTube playlist into a course?",
        a: "Sign in to ZverTs with Google, open Courses and paste the playlist link. Every video is imported in order as a lesson, ready to study with progress tracking.",
    },
    {
        q: "Is the YouTube playlist to course converter free?",
        a: "Yes, your first 3 playlists are free. More imports use credits, which you can buy with bKash, Nagad or Rocket.",
    },
    {
        q: "Can I skip ahead in a ZverTs course?",
        a: "No. Each lesson unlocks when you finish the one before it, so you actually learn in order instead of jumping around.",
    },
    {
        q: "How does ZverTs know I watched a video?",
        a: "It counts the seconds you really watch, not just clicks. A lesson is complete only when you've watched enough of it.",
    },
    {
        q: "Do I get a certificate?",
        a: "Yes. When you finish every lesson of a course you get a certificate with your name and a unique certificate code.",
    },
    {
        q: "Does it work with any YouTube playlist?",
        a: "Any public YouTube playlist works: programming, HSC and SSC lessons, languages, design and more.",
    },
];

const infoPage = (slug: string, priority = 0.5): PublicPage | null => {
    const p = INFO_PAGES.find((x) => x.slug === slug);
    if (!p) return null;
    const firstBody = p.sections.find((s) => s.body)?.body ?? "";
    return {
        path: `/info/${p.slug}`,
        title: `${p.title} — ZverTs`,
        description: (p.tagline && p.tagline.length > 40
            ? p.tagline
            : `${p.title}: ${firstBody}`
        ).slice(0, 158),
        h1: p.title,
        intro: p.tagline ?? "",
        sections: p.sections.map((s) => ({
            h2: s.heading ?? p.title,
            p: s.body,
            list: s.bullets,
        })),
        faq:
            slug === "faq"
                ? p.sections
                      .filter((s) => s.heading && s.body)
                      .map((s) => ({ q: s.heading!.replace(/^\d+\.\s*/, ""), a: s.body! }))
                : undefined,
        priority,
        changefreq: "monthly",
    };
};

export const PUBLIC_PAGES: PublicPage[] = [
    {
        path: "/",
        title: HOME_TITLE,
        description: HOME_DESCRIPTION,
        h1: "Turn any YouTube playlist into a structured course",
        intro: "Create disciplined learning paths from YouTube playlists with modules, tracking, streaks, gems, and progress analytics.",
        sections: [
            {
                h2: "Three steps to a real course",
                list: [
                    "Paste a YouTube playlist link.",
                    "ZverTs turns every video into a lesson, in order.",
                    "Learn one lesson at a time with real watch-time tracking.",
                ],
            },
            {
                h2: "Everything you need to finish",
                list: [
                    "Lessons unlock in order, so you can't skip ahead",
                    "Real watch-time tracking and a daily goal",
                    "Streaks, XP, gems, badges and a leaderboard",
                    "Notes and a built-in C, C++ and Python code runner",
                    "A certificate when you finish",
                    "Works in English and Bangla, and offline",
                ],
            },
        ],
        faq: PLAYLIST_FAQ.slice(0, 3),
        priority: 1,
        changefreq: "weekly",
    },
    {
        path: "/youtube-playlist-to-course",
        title: "YouTube Playlist to Course Converter (Free) — ZverTs",
        description:
            "Convert any YouTube playlist into a structured online course for free. Lessons unlock in order, watch time is tracked, and you earn a certificate. Try ZverTs.",
        h1: "YouTube playlist to course converter",
        intro: "Paste a YouTube playlist link and ZverTs turns it into a course you actually finish: lessons in order, real watch-time tracking, streaks and a certificate at the end.",
        sections: [
            {
                h2: "How to convert a YouTube playlist into a course",
                list: [
                    "Sign in to ZverTs with your Google account.",
                    "Open Courses and paste the YouTube playlist link.",
                    "ZverTs imports every video, in order, as a lesson.",
                    "Start lesson 1. The next one unlocks when you finish it.",
                    "Finish every lesson to get your certificate.",
                ],
            },
            {
                h2: "Why learn from a playlist on ZverTs instead of YouTube",
                list: [
                    "No autoplay rabbit holes or recommendations pulling you away",
                    "You always know where you stopped and what's next",
                    "Progress counts real minutes watched, not clicks",
                    "Daily goal, streaks and XP keep you coming back",
                    "Take notes and run C, C++ or Python next to the video",
                ],
            },
            {
                h2: "Made for students",
                p: "Learners in Bangladesh and beyond use ZverTs for programming playlists, HSC and SSC chapters, web development, languages and more. It works in English and Bangla, on phones and laptops.",
            },
        ],
        faq: PLAYLIST_FAQ,
        priority: 0.9,
        changefreq: "monthly",
    },
    {
        path: "/code",
        title: "Online C, C++ and Python Compiler — ZverTs Code Playground",
        description:
            "Write and run C, C++ and Python online in your browser, with program input. Free, no sign-up needed, and it keeps working offline once loaded.",
        h1: "Online C, C++ and Python compiler",
        intro: "Write and run C, C++ and Python right in your browser, with input for your program. Nothing to install.",
        priority: 0.7,
        changefreq: "monthly",
    },
    ...(["about", "faq", "help", "contact", "support", "community", "affiliates", "careers", "blog"]
        .map((s) => infoPage(s, s === "faq" || s === "about" ? 0.6 : 0.4))
        .filter(Boolean) as PublicPage[]),
    {
        path: "/privacy-policy",
        title: "Privacy Policy — ZverTs",
        description: "How ZverTs collects, uses and protects your information.",
        h1: "Privacy Policy",
        intro: "How ZverTs collects, uses and protects your information.",
        priority: 0.2,
        changefreq: "yearly",
    },
    {
        path: "/terms-of-service",
        title: "Terms of Service — ZverTs",
        description: "The terms for using ZverTs.",
        h1: "Terms of Service",
        intro: "The terms for using ZverTs.",
        priority: 0.2,
        changefreq: "yearly",
    },
    {
        path: "/refund-policy",
        title: "Refund Policy — ZverTs",
        description: "When and how ZverTs refunds payments.",
        h1: "Refund Policy",
        intro: "When and how ZverTs refunds payments.",
        priority: 0.2,
        changefreq: "yearly",
    },
];

/** JSON-LD for a public page: the site and organisation, plus FAQ / HowTo where they apply. */
export const jsonLdFor = (page: PublicPage) => {
    const ld: Record<string, unknown>[] = [
        {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: BRAND,
            alternateName: ALT_NAMES,
            url: `${SITE}/`,
            inLanguage: ["en", "bn"],
        },
        {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: BRAND,
            alternateName: ALT_NAMES,
            url: `${SITE}/`,
            logo: LOGO,
            email: EMAIL,
        },
    ];
    if (page.path === "/" || page.path === "/youtube-playlist-to-course") {
        ld.push({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: BRAND,
            alternateName: ALT_NAMES,
            url: `${SITE}${page.path}`,
            applicationCategory: "EducationalApplication",
            operatingSystem: "Any",
            description: page.description,
            offers: { "@type": "Offer", price: "0", priceCurrency: "BDT" },
            featureList: [
                "YouTube playlist to course converter",
                "Lessons unlock in order",
                "Real watch-time tracking",
                "Streaks, XP and badges",
                "Completion certificates",
                "Built-in C, C++ and Python code runner",
            ],
        });
    }
    if (page.path === "/youtube-playlist-to-course") {
        const steps = page.sections?.[0]?.list ?? [];
        ld.push({
            "@context": "https://schema.org",
            "@type": "HowTo",
            name: "How to convert a YouTube playlist into a course",
            step: steps.map((text, i) => ({ "@type": "HowToStep", position: i + 1, text })),
        });
    }
    if (page.faq?.length) {
        ld.push({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: page.faq.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
        });
    }
    return ld;
};

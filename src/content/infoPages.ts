// Text of the /info/* pages. Plain data (no React), so the build can also
// write it into each page's static HTML for search engines (see vite.config.ts).
export type InfoSection = { heading?: string; body?: string; bullets?: string[] };
export type InfoPage = {
    slug: string;
    title: string;
    tagline?: string;
    sections: InfoSection[];
};

export const INFO_PAGES: InfoPage[] = [
    {
        slug: "support",
        title: "Support",
        tagline:
            "ZverTs Support is here to help learners have a smooth and stress-free experience. Whether you're facing technical issues, payment problems, course access errors, or app-related bugs, our support system is built to guide you quickly.",
        sections: [
            {
                heading: "We provide",
                bullets: [
                    "Technical troubleshooting",
                    "Account recovery",
                    "Subscription support",
                    "Payment assistance",
                    "Video playback issues",
                    "Code runner help",
                    "Course unlocking help",
                    "Notification issues",
                ],
            },
            { body: "Need help? We've got your back." },
        ],
    },
    {
        slug: "about",
        title: "About Us",
        tagline:
            "ZverTs is a smart learning platform designed to make education easier, more engaging, and structured for modern learners.",
        sections: [
            {
                heading: "We combine",
                bullets: [
                    "Built-in code runner for C, C++ and Python",
                    "Gamification",
                    "Structured, sequential courses",
                    "Genuine watch-time tracking",
                    "Progress tracking",
                    "Bangla-first student-friendly experience",
                ],
            },
            {
                heading: "Our Mission",
                body: "To make learning smarter, fun, and accessible for everyone.",
            },
            {
                heading: "Our Vision",
                body: "To become a next-generation learning ecosystem where students can learn, grow, and level up their skills efficiently.",
            },
        ],
    },
    {
        slug: "faq",
        title: "FAQ",
        tagline: "Frequently Asked Questions",
        sections: [
            {
                heading: "1. What is ZverTs?",
                body: "ZverTs is a learning app that turns YouTube playlists into structured courses, with progress tracking, a built-in code runner, and gamified learning.",
            },
            {
                heading: "2. Is ZverTs free?",
                body: "ZverTs offers both free and premium learning experiences.",
            },
            {
                heading: "3. Can I watch videos inside the app?",
                body: "Yes. Videos are designed to play inside the app for a seamless learning experience.",
            },
            {
                heading: "4. Can I practise coding in the app?",
                body: "Yes. Every lesson has a code runner for C, C++ and Python — write code, give it input, and see the output right next to the video.",
            },
            {
                heading: "5. Can I track progress?",
                body: "Yes. You can monitor XP, streaks, lesson completion, and overall course progress.",
            },
            {
                heading: "6. Is ZverTs beginner-friendly?",
                body: "Absolutely. Courses are built for beginners to advanced learners.",
            },
            {
                heading: "7. How do I turn a YouTube playlist into a course?",
                body: "Sign in with Google, open Courses and paste the playlist link. ZverTs imports every video in order as a lesson, locks each one until the one before is finished, and tracks the time you really watch. Your first 3 playlists are free.",
            },
            {
                heading: "8. Is it ZverTs, Zverts or Zvert?",
                body: "It's ZverTs, at www.zverts.com. People also search for it as Zverts, Zvert, Zvertz, Verts, Z Verts or Zevrt; they all mean the same app.",
            },
            {
                heading: "9. Do I need to install anything?",
                body: "No. ZverTs runs in any modern browser. On a phone you can add it to your home screen to use it like an app, and much of it keeps working offline.",
            },
        ],
    },
    {
        slug: "help",
        title: "Help Center",
        tagline: "The ZverTs Help Center is your self-service knowledge hub.",
        sections: [
            {
                heading: "Find help for",
                bullets: [
                    "Getting started",
                    "Account setup",
                    "Subscription issues",
                    "Course access",
                    "Video problems",
                    "Code runner issues",
                    "Notifications",
                    "Progress tracking",
                    "Password reset",
                    "Payment troubleshooting",
                ],
            },
            { body: "Search. Learn. Solve." },
        ],
    },
    {
        slug: "contact",
        title: "Contact",
        tagline: "Need direct assistance? Reach out to ZverTs.",
        sections: [
            { heading: "Customer Support", body: "For technical or account-related issues." },
            {
                heading: "Business Inquiries",
                body: "Partnerships, collaborations, or enterprise opportunities.",
            },
            { heading: "Feedback", body: "Share bugs, ideas, and suggestions." },
            {
                heading: "Contact Channels",
                bullets: ["Email Support", "Live Chat", "In-App Support", "Social Media"],
            },
            { body: "We'd love to hear from you." },
        ],
    },
    {
        slug: "affiliates",
        title: "Affiliates",
        tagline:
            "Join the ZverTs Affiliate Program. Earn rewards by promoting ZverTs and helping more learners discover smarter education.",
        sections: [
            {
                heading: "Affiliate benefits",
                bullets: [
                    "Referral commissions",
                    "Performance bonuses",
                    "Marketing resources",
                    "Dedicated affiliate support",
                    "Growth opportunities",
                ],
            },
            {
                heading: "Perfect for",
                bullets: [
                    "Content creators",
                    "Educators",
                    "Bloggers",
                    "Student communities",
                    "Learning influencers",
                ],
            },
            { body: "Grow with ZverTs. Earn while helping others learn." },
        ],
    },
    {
        slug: "community",
        title: "Community",
        tagline: "ZverTs is more than an app — it's a learning community.",
        sections: [
            {
                heading: "Connect with",
                bullets: ["Students", "Developers", "Creators", "Mentors", "Lifelong learners"],
            },
            {
                heading: "Community features",
                bullets: [
                    "Discussion groups",
                    "Study challenges",
                    "Learning events",
                    "Peer motivation",
                    "Skill-sharing",
                    "Collaboration",
                ],
            },
            { body: "Learn together. Grow together." },
        ],
    },
    {
        slug: "blog",
        title: "Blog",
        tagline: "Explore insights, updates, and learning resources through the ZverTs Blog.",
        sections: [
            {
                heading: "Topics include",
                bullets: [
                    "Study tips",
                    "Coding practice guides",
                    "Productivity hacks",
                    "Skill development",
                    "Tech & coding tutorials",
                    "Career growth",
                    "App updates",
                    "Educational trends",
                ],
            },
            { body: "Knowledge beyond the classroom." },
        ],
    },
    {
        slug: "careers",
        title: "Careers",
        tagline:
            "Join the team building the future of learning. At ZverTs, we're creating a focused education platform that helps students learn smarter.",
        sections: [
            {
                heading: "We look for",
                bullets: [
                    "Engineers",
                    "Designers",
                    "Product thinkers",
                    "Growth marketers",
                    "Community builders",
                ],
            },
            {
                heading: "Why join us?",
                bullets: [
                    "Purpose-driven work",
                    "Innovation-focused culture",
                    "Learning opportunities",
                    "Growth mindset",
                    "Flexible collaboration",
                    "Real impact",
                ],
            },
            { body: "Build the future of education with ZverTs." },
        ],
    },
];

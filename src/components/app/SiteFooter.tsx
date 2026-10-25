// A short footer in the modern-app style: brand and socials, one wrapping row
// of links, then copyright and legal. It clears the floating tab bar on phones.
import { Link } from "react-router-dom";
import { Facebook, Instagram, Mail, Twitter, Youtube } from "lucide-react";
import { useTheme } from "next-themes";

const links = [
    { label: "Courses", to: "/courses" },
    { label: "Playlist to course", to: "/youtube-playlist-to-course" },
    { label: "Code playground", to: "/code" },
    { label: "Pricing", to: "/buy" },
    { label: "About", to: "/info/about" },
    { label: "Help", to: "/info/help" },
    { label: "FAQ", to: "/info/faq" },
    { label: "Contact", to: "/info/contact" },
    { label: "Blog", to: "/info/blog" },
    { label: "Careers", to: "/info/careers" },
];

const legal = [
    { label: "Terms", to: "/terms-of-service" },
    { label: "Privacy", to: "/privacy-policy" },
    { label: "Refunds", to: "/refund-policy" },
];

const socials = [
    { Icon: Facebook, href: "#", label: "Facebook" },
    { Icon: Twitter, href: "#", label: "X / Twitter" },
    { Icon: Instagram, href: "#", label: "Instagram" },
    { Icon: Youtube, href: "#", label: "YouTube" },
    { Icon: Mail, href: "mailto:zvertsofficial@gmail.com", label: "Email us" },
];

export const SiteFooter = () => {
    const year = new Date().getFullYear();
    const { resolvedTheme } = useTheme();

    return (
        <footer className="mt-10 border-t border-border/60">
            <div className="container py-7 md:py-8">
                <div className="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center lg:gap-10">
                    <div>
                        <Link to="/" className="inline-flex items-center gap-2">
                            <img
                                src={
                                    resolvedTheme === "dark" ? "/hero-light.svg" : "/hero-dark.svg"
                                }
                                alt=""
                                className="h-7 w-auto"
                                loading="lazy"
                            />
                            <span className="font-display text-lg font-bold tracking-[0.12em]">
                                ZverTs
                            </span>
                        </Link>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                            Learn with discipline. Grow every day.
                        </p>
                    </div>

                    <nav
                        aria-label="Footer"
                        className="flex flex-wrap gap-x-5 gap-y-2.5 text-sm text-muted-foreground lg:justify-center"
                    >
                        {links.map((l) => (
                            <Link
                                key={l.to}
                                to={l.to}
                                className="transition-colors hover:text-foreground"
                            >
                                {l.label}
                            </Link>
                        ))}
                    </nav>

                    <div className="flex items-center gap-2">
                        {socials.map(({ Icon, href, label }) => (
                            <a
                                key={label}
                                href={href}
                                aria-label={label}
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary"
                            >
                                <Icon className="h-4 w-4" />
                            </a>
                        ))}
                    </div>
                </div>

                <div className="mt-6 flex flex-col items-start gap-2 border-t border-border/50 pt-5 text-xs text-muted-foreground sm:flex-row sm:justify-between">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span>© {year} ZverTs</span>
                        {legal.map((l) => (
                            <Link
                                key={l.to}
                                to={l.to}
                                className="transition-colors hover:text-foreground"
                            >
                                {l.label}
                            </Link>
                        ))}
                    </div>
                    <span>
                        A product of{" "}
                        <a
                            href="https://zerod.vercel.app"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-foreground/80 hover:text-primary"
                        >
                            ZeroD
                        </a>
                    </span>
                </div>
            </div>
        </footer>
    );
};

export default SiteFooter;

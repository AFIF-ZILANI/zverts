import { useParams, Navigate, Link } from "react-router-dom";
import { AppShell } from "@/components/app/AppShell";
import { SEO } from "@/components/SEO";
import { OfficialEmail } from "@/components/OfficialEmail";
import { INFO_PAGES, type InfoPage } from "@/content/infoPages";
import { PUBLIC_PAGES } from "@/content/seo";
import {
    LifeBuoy,
    Info as InfoIcon,
    HelpCircle,
    BookOpen,
    Mail,
    Handshake,
    Users,
    Newspaper,
    Briefcase,
    ChevronRight,
} from "lucide-react";

type Page = InfoPage;
const PAGES = INFO_PAGES;
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    support: LifeBuoy,
    about: InfoIcon,
    faq: HelpCircle,
    help: BookOpen,
    contact: Mail,
    affiliates: Handshake,
    community: Users,
    blog: Newspaper,
    careers: Briefcase,
};

const Info = () => {
    const { slug } = useParams<{ slug: string }>();
    const page = PAGES.find((p) => p.slug === slug);
    if (!page) return <Navigate to="/" replace />;

    const Icon = ICONS[page.slug] ?? InfoIcon;
    const related = PAGES.filter((p) => p.slug !== page.slug).slice(0, 6);

    const faqJsonLd =
        page.slug === "faq"
            ? {
                  "@context": "https://schema.org",
                  "@type": "FAQPage",
                  mainEntity: page.sections
                      .filter((s) => s.heading && s.body)
                      .map((s) => ({
                          "@type": "Question",
                          name: s.heading!.replace(/^\d+\.\s*/, ""),
                          acceptedAnswer: { "@type": "Answer", text: s.body! },
                      })),
              }
            : undefined;

    const meta = PUBLIC_PAGES.find((p) => p.path === `/info/${page.slug}`);
    const description =
        meta?.description ?? (page.tagline?.slice(0, 155) || `${page.title} on ZverTs.`);

    return (
        <AppShell>
            <SEO
                title={page.title}
                description={description}
                path={`/info/${page.slug}`}
                jsonLd={faqJsonLd}
            />
            <main className="container py-10 md:py-14">
                <nav className="text-xs text-muted-foreground mb-6 flex items-center gap-1.5">
                    <Link to="/" className="hover:text-primary transition-colors">
                        Home
                    </Link>
                    <ChevronRight className="h-3 w-3" />
                    <span className="text-foreground">{page.title}</span>
                </nav>

                <header className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card/80 via-card/40 to-background backdrop-blur p-8 md:p-12">
                    <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_hsl(var(--primary)/0.18),_transparent_60%)]" />
                    <div className="flex items-start gap-5">
                        <div className="h-14 w-14 grid place-items-center rounded-2xl bg-primary/10 border border-primary/30 text-primary shrink-0">
                            <Icon className="h-7 w-7" />
                        </div>
                        <div>
                            <h1 className="font-display text-3xl md:text-5xl font-bold tracking-tight bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">
                                {page.title}
                            </h1>
                            {page.tagline && (
                                <p className="mt-3 text-base md:text-lg text-muted-foreground max-w-3xl leading-relaxed">
                                    {page.tagline}
                                </p>
                            )}
                        </div>
                    </div>
                </header>

                <article className="mt-10 grid gap-6 md:grid-cols-2">
                    {page.sections.map((s, i) => (
                        <section
                            key={i}
                            className={
                                "rounded-2xl border border-border/60 bg-card/40 backdrop-blur p-6 md:p-7 hover:border-primary/40 transition-colors " +
                                (!s.heading && !s.bullets
                                    ? "md:col-span-2 text-center italic text-muted-foreground"
                                    : "")
                            }
                        >
                            {s.heading && (
                                <h2 className="font-display text-xl font-semibold mb-3 text-foreground">
                                    {s.heading}
                                </h2>
                            )}
                            {s.body && (
                                <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                                    {s.body}
                                </p>
                            )}
                            {s.bullets && (
                                <ul className="space-y-2">
                                    {s.bullets.map((b) => (
                                        <li
                                            key={b}
                                            className="flex items-start gap-2.5 text-sm text-muted-foreground"
                                        >
                                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                                            <span>{b}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    ))}
                </article>

                {["contact", "support", "help", "about"].includes(page.slug) && (
                    <section className="mt-10">
                        <h3 className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground mb-4">
                            Official Email
                        </h3>
                        <OfficialEmail variant="card" label="Reach the ZverTs team" />
                        <p className="mt-3 text-xs text-muted-foreground">
                            For support, business inquiries, partnerships, premium issues, and
                            refund requests.
                        </p>
                    </section>
                )}

                <section className="mt-14">
                    <h3 className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground mb-4">
                        Explore more
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {related.map((r) => {
                            const RIcon = ICONS[r.slug] ?? InfoIcon;
                            return (
                                <Link
                                    key={r.slug}
                                    to={`/info/${r.slug}`}
                                    className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card/30 backdrop-blur px-4 py-3 hover:border-primary/50 hover:bg-primary/5 transition-all"
                                >
                                    <RIcon className="h-4 w-4 text-primary" />
                                    <span className="text-sm font-medium group-hover:text-primary transition-colors">
                                        {r.title}
                                    </span>
                                    <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground group-hover:translate-x-0.5 group-hover:text-primary transition-all" />
                                </Link>
                            );
                        })}
                    </div>
                </section>
            </main>
        </AppShell>
    );
};

export default Info;

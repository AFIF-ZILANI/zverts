// /youtube-playlist-to-course: the public page for people searching how to
// turn a YouTube playlist into a course. Its text comes from content/seo.ts,
// the same source the build writes into this page's static HTML.
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { PUBLIC_PAGES, jsonLdFor } from "@/content/seo";

const PAGE = PUBLIC_PAGES.find((p) => p.path === "/youtube-playlist-to-course")!;

const PlaylistToCourse = () => {
    const { user } = useAuth();
    const cta = user ? "/courses" : "/auth";
    return (
        <AppShell>
            <SEO
                title={PAGE.title}
                description={PAGE.description}
                path={PAGE.path}
                jsonLd={jsonLdFor(PAGE)}
            />
            <article className="container max-w-3xl py-10 md:py-16">
                <nav className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Link to="/" className="hover:text-primary">
                        Home
                    </Link>
                    <span>/</span>
                    <span>Playlist to course</span>
                </nav>
                <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
                    {PAGE.h1}
                </h1>
                <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{PAGE.intro}</p>
                <Button asChild size="lg" className="mt-7 rounded-full px-6">
                    <Link to={cta}>
                        Convert a playlist <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                </Button>

                {PAGE.sections?.map((s, i) => (
                    <section key={s.h2} className="mt-12">
                        <h2 className="font-display text-2xl font-semibold tracking-tight">
                            {s.h2}
                        </h2>
                        {s.p && <p className="mt-3 leading-relaxed text-muted-foreground">{s.p}</p>}
                        {s.list &&
                            (i === 0 ? (
                                <ol className="mt-4 space-y-3">
                                    {s.list.map((item, n) => (
                                        <li key={item} className="flex gap-3">
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                                                {n + 1}
                                            </span>
                                            <span className="pt-0.5">{item}</span>
                                        </li>
                                    ))}
                                </ol>
                            ) : (
                                <ul className="mt-4 space-y-2.5">
                                    {s.list.map((item) => (
                                        <li key={item} className="flex gap-2.5">
                                            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            ))}
                    </section>
                ))}

                {PAGE.faq && (
                    <section className="mt-14">
                        <h2 className="font-display text-2xl font-semibold tracking-tight">
                            Questions
                        </h2>
                        <div className="mt-4 divide-y divide-border rounded-3xl border border-border bg-card shadow-card">
                            {PAGE.faq.map((f) => (
                                <details key={f.q} className="group px-5 py-4">
                                    <summary className="cursor-pointer list-none font-medium marker:hidden">
                                        {f.q}
                                    </summary>
                                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                        {f.a}
                                    </p>
                                </details>
                            ))}
                        </div>
                    </section>
                )}

                <div className="mt-14 rounded-3xl border border-primary/30 bg-primary/5 p-6 text-center">
                    <h2 className="font-display text-2xl font-semibold">
                        Turn your first playlist into a course
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Your first 3 playlists are free.
                    </p>
                    <Button asChild size="lg" className="mt-5 rounded-full px-6">
                        <Link to={cta}>
                            Get started <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </div>
            </article>
        </AppShell>
    );
};

export default PlaylistToCourse;

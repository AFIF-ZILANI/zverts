import { AppShell } from "@/components/app/AppShell";
import { SEO } from "@/components/SEO";
import { PUBLIC_PAGES } from "@/content/seo";

const PAGE = PUBLIC_PAGES.find((p) => p.path === "/code")!;
import { CodeRunner } from "@/components/app/code-runner/CodeRunner";

// The code runner on its own, outside any lesson. Unlike a lesson page it
// needs no data from the server, so it also opens offline (the service worker
// keeps the editor and the C/C++/Python runtimes once they've been used).
const CodePlayground = () => (
    <AppShell>
        <SEO title={PAGE.title} description={PAGE.description} path={PAGE.path} />
        <section className="container max-w-5xl lg:max-w-7xl py-6 md:py-10 space-y-4">
            <div>
                <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    / code
                </p>
                <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mt-1">
                    Code Playground
                </h1>
                <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
                    Practise C, C++ and Python anytime. Everything runs in your browser — once
                    downloaded, it works without internet too.
                </p>
            </div>
            <CodeRunner moduleId="playground" alwaysOpen />
        </section>
    </AppShell>
);

export default CodePlayground;

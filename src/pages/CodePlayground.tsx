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
        <section className="px-2 sm:px-4 py-3 md:py-4 space-y-3">
            <div className="flex items-baseline gap-3 px-1">
                <h1 className="font-display text-lg md:text-xl font-semibold tracking-tight">
                    Code Playground
                </h1>
                <p className="hidden sm:block truncate text-xs text-muted-foreground">
                    C, C++ and Python — runs in your browser, works offline once downloaded.
                </p>
            </div>
            <CodeRunner moduleId="playground" alwaysOpen />
        </section>
    </AppShell>
);

export default CodePlayground;

import { defineConfig, type Plugin } from "vite";
import type { OutputChunk } from "rollup";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { CLANG_BASE, PYODIDE_URL } from "./src/components/app/code-runner/cdn";
import { PUBLIC_PAGES, SITE, jsonLdFor, type PublicPage } from "./src/content/seo";

// Unique per build. Baked into the bundle and written to /version.json so open
// tabs can tell when a newer build has been deployed (see useVersionCheck).
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now());

const versionFile = (): Plugin => ({
    name: "version-file",
    apply: "build",
    generateBundle() {
        this.emitFile({
            type: "asset",
            fileName: "version.json",
            source: JSON.stringify({ version: BUILD_ID }),
        });
    },
});

// Lists what the app needs to open offline in /precache.json, which the service
// worker caches on install: the entry, every route page, and everything they
// import — including lazily loaded components (footer, notification panel,
// charts), since one missing lazy chunk breaks the whole screen.
// Left out: pages that need the network anyway (video player, certificate)
// and heavy on-demand libraries that only load on a button press.
const ONLINE_ONLY_PAGES = ["ModulePlayer", "Certificate"];
// CodeWorkspace (Monaco, ~4 MB) is cached on first use instead — see runnerManifest.
const ON_DEMAND_LIBS = ["jspdf", "html2canvas", "CodeWorkspace"];

const precacheManifest = (): Plugin => ({
    name: "precache-manifest",
    apply: "build",
    generateBundle(_, bundle) {
        const pageIds = (chunk: OutputChunk) =>
            chunk.moduleIds.filter((id) =>
                id.includes(`${path.sep}src${path.sep}pages${path.sep}`),
            );
        const skip = (chunk: OutputChunk) =>
            ON_DEMAND_LIBS.some((n) => chunk.fileName.includes(`/${n}`)) ||
            pageIds(chunk).some((id) =>
                ONLINE_ONLY_PAGES.some((n) => id.endsWith(`${path.sep}${n}.tsx`)),
            );

        const files = new Set<string>();
        const visit = (fileName: string, followLazy: boolean) => {
            const chunk = bundle[fileName];
            if (!chunk || chunk.type !== "chunk" || files.has(fileName) || skip(chunk)) return;
            files.add(fileName);
            chunk.viteMetadata?.importedCss.forEach((css) => files.add(css));
            chunk.imports.forEach((f) => visit(f, followLazy));
            if (followLazy) chunk.dynamicImports.forEach((f) => visit(f, true));
        };
        for (const chunk of Object.values(bundle)) {
            if (chunk.type !== "chunk") continue;
            // The entry lazy-loads every page; pages are added below, so only
            // follow its static imports. moduleIds, not facadeModuleId: a page
            // chunk can bundle extra modules and then has no facade.
            if (chunk.isEntry) visit(chunk.fileName, false);
            else if (chunk.isDynamicEntry && pageIds(chunk).length) visit(chunk.fileName, true);
        }
        this.emitFile({
            type: "asset",
            fileName: "precache.json",
            source: JSON.stringify([...files].map((f) => `/${f}`)),
        });
    },
});

// Lists the code runner's files in /runner-assets.json: the editor chunk and
// everything it loads (Monaco language chunks, CSS, the codicon font), the
// runner's workers, and the CDN prefixes of Pyodide and Clang. The service
// worker keeps these in their own cache as they're first fetched, so the
// runner works offline after one online use — without adding them to the
// install-time precache that every visitor downloads.
const runnerManifest = (): Plugin => ({
    name: "runner-manifest",
    apply: "build",
    generateBundle(_, bundle) {
        const files = new Set<string>();
        const visit = (fileName: string) => {
            const chunk = bundle[fileName];
            // Not the app entry: it's precached already, and its lazy imports are every page.
            if (!chunk || chunk.type !== "chunk" || chunk.isEntry || files.has(fileName)) return;
            files.add(fileName);
            chunk.viteMetadata?.importedCss.forEach((css) => files.add(css));
            chunk.viteMetadata?.importedAssets.forEach((a) => files.add(a));
            chunk.imports.forEach(visit);
            chunk.dynamicImports.forEach(visit);
        };
        for (const chunk of Object.values(bundle)) {
            if (
                chunk.type === "chunk" &&
                chunk.isDynamicEntry &&
                /\/CodeWorkspace-/.test(chunk.fileName)
            ) {
                visit(chunk.fileName);
            }
        }
        for (const item of Object.values(bundle)) {
            // Workers (Monaco's, Clang, the program runner, Pyodide) are emitted as assets.
            if (/\.worker-[^/]+\.js$/.test(item.fileName)) files.add(item.fileName);
        }
        // Fonts referenced from the runner's CSS (codicons).
        for (const f of [...files]) {
            const css = bundle[f];
            if (css?.type !== "asset" || !f.endsWith(".css")) continue;
            for (const m of String(css.source).matchAll(/url\(\/?(assets\/[^)"']+)\)/g))
                files.add(m[1]);
        }
        this.emitFile({
            type: "asset",
            fileName: "runner-assets.json",
            source: JSON.stringify({
                files: [...files].map((f) => `/${f}`),
                cdn: [PYODIDE_URL, CLANG_BASE],
            }),
        });
    },
});

// Search engines and AI crawlers often read a page without running its
// JavaScript, so every public page (src/content/seo.ts) gets its own HTML file
// with its title, description, canonical URL, JSON-LD and text in #root. The
// app replaces that text as soon as it starts. Signed-in routes are served
// app.html (see vercel.json), the same shell marked noindex. Also writes
// sitemap.xml and robots.txt.
const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const seoHead = (p: PublicPage) => {
    const url = `${SITE}${p.path}`;
    return [
        `<title>${esc(p.title)}</title>`,
        // data-seo="static": the SEO component removes these once the app has
        // rendered its own, so the page never carries two descriptions.
        `<meta name="description" content="${esc(p.description)}" data-seo="static" />`,
        `<link rel="canonical" href="${url}" data-seo="static" />`,
        `<meta property="og:url" content="${url}" data-seo="static" />`,
        `<meta property="og:title" content="${esc(p.title)}" data-seo="static" />`,
        `<meta property="og:description" content="${esc(p.description)}" data-seo="static" />`,
        `<meta name="twitter:title" content="${esc(p.title)}" data-seo="static" />`,
        `<meta name="twitter:description" content="${esc(p.description)}" data-seo="static" />`,
    ].join("\n        ");
};

const seoBody = (p: PublicPage) => {
    const sections = (p.sections ?? [])
        .map(
            (s) =>
                `<h2>${esc(s.h2)}</h2>` +
                (s.p ? `<p>${esc(s.p)}</p>` : "") +
                (s.list ? `<ul>${s.list.map((li) => `<li>${esc(li)}</li>`).join("")}</ul>` : ""),
        )
        .join("");
    const faq = p.faq?.length
        ? `<h2>Questions</h2>${p.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("")}`
        : "";
    const links = PUBLIC_PAGES.filter((o) => o.path !== p.path)
        .map((o) => `<a href="${o.path}">${esc(o.h1)}</a>`)
        .join(" · ");
    return (
        `<main style="max-width:760px;margin:0 auto;padding:96px 20px;font-family:Inter,system-ui,sans-serif;line-height:1.6">` +
        `<h1>${esc(p.h1)}</h1><p>${esc(p.intro)}</p>${sections}${faq}` +
        `<p><a href="/auth">Get started with ZverTs</a></p><nav>${links}</nav></main>`
    );
};

const seoPages = (): Plugin => {
    let outDir = "dist";
    return {
        name: "seo-pages",
        apply: "build",
        configResolved(config) {
            outDir = path.resolve(config.root, config.build.outDir);
        },
        closeBundle() {
            // Every public page needs its rewrite in vercel.json, or Vercel would
            // send it the app shell instead of its own HTML.
            const vercel = JSON.parse(
                fs.readFileSync(path.resolve(outDir, "..", "vercel.json"), "utf8"),
            );
            const rewritten = new Set(
                (vercel.rewrites as { source: string }[]).map((r) => r.source),
            );
            const missing = PUBLIC_PAGES.filter((p) => p.path !== "/" && !rewritten.has(p.path));
            if (missing.length)
                throw new Error(
                    `vercel.json has no rewrite for: ${missing.map((p) => p.path).join(", ")}`,
                );
            const shellPath = path.join(outDir, "index.html");
            if (!fs.existsSync(shellPath)) return;
            const shell = fs.readFileSync(shellPath, "utf8");
            const block = /<!-- seo:start[\s\S]*?<!-- seo:end -->/;
            fs.writeFileSync(
                path.join(outDir, "app.html"),
                shell
                    .replace(block, "<title>ZverTs</title>")
                    .replace(
                        /<meta name="robots" content="[^"]*" \/>/,
                        '<meta name="robots" content="noindex" />',
                    ),
            );
            for (const p of PUBLIC_PAGES) {
                const ld = jsonLdFor(p)
                    .map(
                        (x) =>
                            `<script type="application/ld+json" data-seo="static">${JSON.stringify(x).replace(/</g, "\\u003c")}</script>`,
                    )
                    .join("\n        ");
                const html = shell
                    .replace(block, seoHead(p))
                    .replace("</head>", `        ${ld}\n    </head>`)
                    .replace('<div id="root"></div>', `<div id="root">${seoBody(p)}</div>`);
                const file = p.path === "/" ? "index.html" : `${p.path.slice(1)}/index.html`;
                fs.mkdirSync(path.dirname(path.join(outDir, file)), { recursive: true });
                fs.writeFileSync(path.join(outDir, file), html);
            }
            const today = new Date().toISOString().slice(0, 10);
            fs.writeFileSync(
                path.join(outDir, "sitemap.xml"),
                `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
                    PUBLIC_PAGES.map(
                        (p) =>
                            `  <url><loc>${SITE}${p.path}</loc><lastmod>${today}</lastmod><changefreq>${p.changefreq}</changefreq><priority>${p.priority.toFixed(1)}</priority></url>`,
                    ).join("\n") +
                    `\n</urlset>\n`,
            );
            const privatePaths = [
                "/admin",
                "/auth",
                "/buy",
                "/certificate",
                "/courses",
                "/dashboard",
                "/growth",
                "/leaderboard",
                "/learn",
                "/payment",
                "/payments",
                "/profile",
                "/settings",
            ];
            fs.writeFileSync(
                path.join(outDir, "robots.txt"),
                [
                    "# Search engines and AI assistants are welcome on the public pages.",
                    "User-agent: *",
                    "Allow: /",
                    ...privatePaths.map((p) => `Disallow: ${p}`),
                    "",
                    ...[
                        "GPTBot",
                        "OAI-SearchBot",
                        "ChatGPT-User",
                        "ClaudeBot",
                        "Claude-SearchBot",
                        "PerplexityBot",
                        "Google-Extended",
                        "Applebot-Extended",
                        "Bingbot",
                    ].flatMap((bot) => [
                        `User-agent: ${bot}`,
                        "Allow: /",
                        ...privatePaths.map((p) => `Disallow: ${p}`),
                        "",
                    ]),
                    `Sitemap: ${SITE}/sitemap.xml`,
                    "",
                ].join("\n"),
            );
        },
    };
};

export default defineConfig({
    define: {
        __APP_VERSION__: JSON.stringify(BUILD_ID),
    },
    server: {
        host: "localhost",
    },
    plugins: [react(), versionFile(), precacheManifest(), runnerManifest(), seoPages()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
        dedupe: [
            "react",
            "react-dom",
            "react/jsx-runtime",
            "react/jsx-dev-runtime",
            "@tanstack/react-query",
            "@tanstack/query-core",
        ],
    },
    // Module workers: the code runner's workers import() Pyodide/Clang from a CDN.
    worker: {
        format: "es",
    },
    build: {
        target: "es2020",
        cssCodeSplit: true,
        minify: "esbuild",
        reportCompressedSize: false,
        chunkSizeWarningLimit: 1600,
    },
});

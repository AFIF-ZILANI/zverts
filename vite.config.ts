import { defineConfig, type Plugin } from "vite";
import type { OutputChunk } from "rollup";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { CLANG_BASE, PYODIDE_URL } from "./src/components/app/code-runner/cdn";

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
            chunk.moduleIds.filter((id) => id.includes(`${path.sep}src${path.sep}pages${path.sep}`));
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
            if (chunk.type === "chunk" && chunk.isDynamicEntry && /\/CodeWorkspace-/.test(chunk.fileName)) {
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
            for (const m of String(css.source).matchAll(/url\(\/?(assets\/[^)"']+)\)/g)) files.add(m[1]);
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

export default defineConfig({
    define: {
        __APP_VERSION__: JSON.stringify(BUILD_ID),
    },
    server: {
        host: "localhost",
    },
    plugins: [react(), versionFile(), precacheManifest(), runnerManifest()],
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

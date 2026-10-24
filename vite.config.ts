import { defineConfig, type Plugin } from "vite";
import type { OutputChunk } from "rollup";
import react from "@vitejs/plugin-react-swc";
import path from "path";

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
// Left out: pages that need the network anyway (video player, AI, certificate)
// and heavy on-demand libraries that only load on a button press.
const ONLINE_ONLY_PAGES = ["ModulePlayer", "AIWorkspace", "Certificate"];
const ON_DEMAND_LIBS = ["jspdf", "html2canvas", "ModelSelector"];

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

export default defineConfig({
    define: {
        __APP_VERSION__: JSON.stringify(BUILD_ID),
    },
    server: {
        host: "localhost",
    },
    plugins: [react(), versionFile(), precacheManifest()],
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
    build: {
        target: "es2020",
        cssCodeSplit: true,
        minify: "esbuild",
        reportCompressedSize: false,
        chunkSizeWarningLimit: 1600,
    },
});

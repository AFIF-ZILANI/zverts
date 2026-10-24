import { defineConfig, type Plugin } from "vite";
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

export default defineConfig({
    define: {
        __APP_VERSION__: JSON.stringify(BUILD_ID),
    },
    server: {
        host: "localhost",
    },
    plugins: [react(), versionFile()],
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

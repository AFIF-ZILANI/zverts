import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { ReactNode, useEffect } from "react";

// Matches --background in index.css, so the installed app's title bar / status
// bar blends into the header instead of staying dark in light mode.
const THEME_COLORS = { dark: "#121216", light: "#fafafa" } as const;

const ThemeColorSync = () => {
    const { resolvedTheme } = useTheme();
    useEffect(() => {
        const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
        if (meta) meta.content = resolvedTheme === "light" ? THEME_COLORS.light : THEME_COLORS.dark;
    }, [resolvedTheme]);
    return null;
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => (
    <NextThemesProvider attribute="class" enableSystem={false} defaultTheme="dark">
        <ThemeColorSync />
        {children}
    </NextThemesProvider>
);

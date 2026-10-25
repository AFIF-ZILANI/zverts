import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { useState } from "react";

// One click switches between the two themes. (It was a dropdown menu, whose
// modal layer blocked scrolling and clicks on the page while it was open.)
export const ThemeToggle = () => {
    const { resolvedTheme, setTheme } = useTheme();
    const dark = resolvedTheme !== "light";

    return (
        <Button
            variant="ghost"
            size="icon"
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            title={dark ? "Light mode" : "Dark mode"}
            onClick={() => setTheme(dark ? "light" : "dark")}
        >
            {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>
    );
};

export const LanguageToggle = () => {
    const [lang, setLang] = useState<"en" | "bn">(
        (typeof window !== "undefined" && (localStorage.getItem("i18nextLng") as "en" | "bn" | null)) || "en",
    );
    const toggle = async () => {
        const next = lang === "en" ? "bn" : "en";
        const i18n = (await import("@/lib/i18n")).default;
        i18n.changeLanguage(next);
        setLang(next);
    };
    return (
        <Button variant="ghost" size="sm" onClick={toggle} className="font-mono text-xs">
            {lang === "en" ? "বাংলা" : "EN"}
        </Button>
    );
};

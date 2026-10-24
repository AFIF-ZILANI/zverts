import type { RunLanguage } from "./languages";

// Blank out comments and string/char literals (keeping length) so that
// `// scanf` or `printf("cin")` don't count as reading input.
const stripC = (code: string) =>
    code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, (m) =>
        m.replace(/[^\n]/g, " "),
    );

const stripPython = (code: string) =>
    code.replace(
        /"""[\s\S]*?"""|'''[\s\S]*?'''|#[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g,
        (m) => m.replace(/[^\n]/g, " "),
    );

const C_READS =
    /\b(scanf|getchar|gets|fgets|getline|getc|fgetc|cin)\b|\bfscanf\s*\(\s*stdin\b|\bfread\s*\([^;]*\bstdin\b/;
const PY_READS = /\b(input)\s*\(|\b(sys\.stdin)\b|\bopen\s*\(\s*0\s*\)/;

/**
 * The input call the program uses (e.g. "scanf", "cin", "input"), or null if
 * it never reads stdin. A static check: good enough to ask for input before
 * a run, not a guarantee the call is reached.
 */
export const readsInput = (lang: RunLanguage, code: string): string | null => {
    const m = lang === "python" ? stripPython(code).match(PY_READS) : stripC(code).match(C_READS);
    if (!m) return null;
    return m[1] ?? m[2] ?? (lang === "python" ? "open(0)" : m[0].split("(")[0].trim());
};

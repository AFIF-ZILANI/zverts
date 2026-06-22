import { describe, it, expect } from "vitest";
import { normalizeLatex } from "./normalizeLatex";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Assert the output contains a display-math block wrapping `inner`. */
function expectDisplayBlock(result: string, inner: string) {
    // Allow leading/trailing whitespace on inner but require blank lines + $$ fences
    const trimmed = inner.trim();
    expect(result).toContain(`$$\n${trimmed}\n$$`);
    // Must be surrounded by blank lines (or at start/end of string)
    const blockRe = /\n\n\$\$\n[\s\S]+?\n\$\$\n\n/;
    expect(result).toMatch(blockRe);
}

/** Assert the output contains an inline math span. */
function expectInline(result: string, inner: string) {
    expect(result).toContain(`$${inner.trim()}$`);
}

// ─── \[...\] display math ─────────────────────────────────────────────────────

describe("\\[...\\] display math", () => {
    it("converts simple single-line display math", () => {
        const result = normalizeLatex("\\[E = mc^2\\]");
        expectDisplayBlock(result, "E = mc^2");
    });

    it("converts display math with fractions", () => {
        const result = normalizeLatex("\\[x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}\\]");
        expectDisplayBlock(result, "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}");
    });

    it("converts multiline display math", () => {
        const input = "\\[\n  a^2 + b^2 = c^2\n\\]";
        const result = normalizeLatex(input);
        expectDisplayBlock(result, "a^2 + b^2 = c^2");
    });

    it("trims inner whitespace from display math", () => {
        const result = normalizeLatex("\\[  E = mc^2  \\]");
        expectDisplayBlock(result, "E = mc^2");
    });

    it("adds blank lines before and after display block", () => {
        const result = normalizeLatex("Before \\[E = mc^2\\] after");
        expect(result).toMatch(/Before \n\n\$\$\nE = mc\^2\n\$\$\n\n after/);
    });

    it("converts summation notation", () => {
        const input = "\\[\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\\]";
        const result = normalizeLatex(input);
        expectDisplayBlock(result, "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}");
    });

    it("converts integral notation", () => {
        const input = "\\[\\int_0^\\infty e^{-x} dx = 1\\]";
        const result = normalizeLatex(input);
        expectDisplayBlock(result, "\\int_0^\\infty e^{-x} dx = 1");
    });

    it("converts matrix inside \\[...\\]", () => {
        const input = "\\[\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}\\]";
        const result = normalizeLatex(input);
        expectDisplayBlock(result, "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}");
    });

    it("converts multiple \\[...\\] blocks in one string", () => {
        const input = "First: \\[a^2\\] Second: \\[b^2\\]";
        const result = normalizeLatex(input);
        expectDisplayBlock(result, "a^2");
        expectDisplayBlock(result, "b^2");
    });

    it("does not produce nested $$ delimiters", () => {
        const result = normalizeLatex("\\[E = mc^2\\]");
        // Should be exactly two $$ markers, not four
        const matches = result.match(/\$\$/g) ?? [];
        expect(matches.length).toBe(2);
    });
});

// ─── \[...\] with inner environments ──────────────────────────────────────────

describe("\\[...\\] with inner environments", () => {
    it("fixes \\begin{align} inside \\[...\\] to \\begin{aligned}", () => {
        const input = "\\[\\begin{align}\nE &= mc^2 \\\\\nF &= ma\n\\end{align}\\]";
        const result = normalizeLatex(input);
        expect(result).toContain("\\begin{aligned}");
        expect(result).toContain("\\end{aligned}");
        expect(result).not.toContain("\\begin{align}\n");
        expectDisplayBlock(result, "\\begin{aligned}\nE &= mc^2 \\\\\nF &= ma\n\\end{aligned}");
    });

    it("fixes \\begin{align*} inside \\[...\\] to \\begin{aligned}", () => {
        const input = "\\[\\begin{align*}\nx &= 1 \\\\\ny &= 2\n\\end{align*}\\]";
        const result = normalizeLatex(input);
        expect(result).toContain("\\begin{aligned}");
        expect(result).not.toContain("\\begin{align*}");
    });

    it("fixes \\begin{eqnarray} inside \\[...\\] to \\begin{aligned}", () => {
        const input = "\\[\\begin{eqnarray}\na &=& b\n\\end{eqnarray}\\]";
        const result = normalizeLatex(input);
        expect(result).toContain("\\begin{aligned}");
        expect(result).not.toContain("\\begin{eqnarray}");
    });

    it("fixes \\begin{gather} inside \\[...\\] to \\begin{gathered}", () => {
        const input = "\\[\\begin{gather}\na = 1 \\\\\nb = 2\n\\end{gather}\\]";
        const result = normalizeLatex(input);
        expect(result).toContain("\\begin{gathered}");
        expect(result).not.toContain("\\begin{gather}\n");
    });

    it("leaves \\begin{aligned} (already KaTeX-compatible) unchanged", () => {
        const input = "\\[\\begin{aligned}\nE &= mc^2\n\\end{aligned}\\]";
        const result = normalizeLatex(input);
        expect(result).toContain("\\begin{aligned}");
        expect(result).toContain("\\end{aligned}");
        // Should appear exactly once (not doubled)
        expect(result.match(/\\begin\{aligned\}/g)?.length).toBe(1);
    });
});

// ─── \(...\) inline math ──────────────────────────────────────────────────────

describe("\\(...\\) inline math", () => {
    it("converts simple inline math", () => {
        const result = normalizeLatex("The value is \\(x^2\\).");
        expectInline(result, "x^2");
    });

    it("trims inner whitespace from inline math", () => {
        const result = normalizeLatex("\\( E = mc^2 \\)");
        expectInline(result, "E = mc^2");
        expect(result).not.toContain("$  E");
        expect(result).not.toContain("c^2  $");
    });

    it("converts inline fraction", () => {
        const result = normalizeLatex("The slope is \\(\\frac{dy}{dx}\\).");
        expectInline(result, "\\frac{dy}{dx}");
    });

    it("converts inline subscript/superscript", () => {
        const result = normalizeLatex("Energy \\(E_k = \\frac{1}{2}mv^2\\) is kinetic.");
        expectInline(result, "E_k = \\frac{1}{2}mv^2");
    });

    it("converts multiple inline formulas in one string", () => {
        const input = "If \\(a > 0\\) and \\(b > 0\\) then \\(a + b > 0\\).";
        const result = normalizeLatex(input);
        expectInline(result, "a > 0");
        expectInline(result, "b > 0");
        expectInline(result, "a + b > 0");
    });

    it("does not produce double-dollar for inline math", () => {
        const result = normalizeLatex("\\(x\\)");
        expect(result).toBe("$x$");
    });
});

// ─── \begin{equation} environments ────────────────────────────────────────────

describe("\\begin{equation} environments", () => {
    it("converts \\begin{equation}...\\end{equation}", () => {
        const input = "\\begin{equation}\nE = mc^2\n\\end{equation}";
        const result = normalizeLatex(input);
        expectDisplayBlock(result, "E = mc^2");
    });

    it("converts \\begin{equation*}...\\end{equation*}", () => {
        const input = "\\begin{equation*}\nF = ma\n\\end{equation*}";
        const result = normalizeLatex(input);
        expectDisplayBlock(result, "F = ma");
    });

    it("trims inner whitespace from equation environment", () => {
        const input = "\\begin{equation}\n  \\sigma = \\frac{F}{A}  \n\\end{equation}";
        const result = normalizeLatex(input);
        expectDisplayBlock(result, "\\sigma = \\frac{F}{A}");
    });
});

// ─── \begin{align} environments ───────────────────────────────────────────────

describe("\\begin{align} environments", () => {
    it("converts standalone \\begin{align}...\\end{align} to aligned inside $$", () => {
        const input = "\\begin{align}\nx &= 1 \\\\\ny &= 2\n\\end{align}";
        const result = normalizeLatex(input);
        expect(result).toContain("\\begin{aligned}");
        expect(result).toContain("\\end{aligned}");
        expectDisplayBlock(result, "\\begin{aligned}\nx &= 1 \\\\\ny &= 2\n\\end{aligned}");
    });

    it("converts standalone \\begin{align*}...\\end{align*}", () => {
        const input = "\\begin{align*}\na &= b + c \\\\\nd &= e - f\n\\end{align*}";
        const result = normalizeLatex(input);
        expect(result).toContain("\\begin{aligned}");
        expect(result).not.toContain("\\begin{align*}");
    });

    it("wraps aligned content in display block delimiters", () => {
        const input = "\\begin{align}\nx = 1\n\\end{align}";
        const result = normalizeLatex(input);
        expect(result).toMatch(/\n\n\$\$\n[\s\S]+?\n\$\$\n\n/);
    });
});

// ─── \begin{gather} environments ──────────────────────────────────────────────

describe("\\begin{gather} environments", () => {
    it("converts standalone \\begin{gather}...\\end{gather} to gathered inside $$", () => {
        const input = "\\begin{gather}\na = 1 \\\\\nb = 2\n\\end{gather}";
        const result = normalizeLatex(input);
        expect(result).toContain("\\begin{gathered}");
        expect(result).toContain("\\end{gathered}");
    });

    it("converts standalone \\begin{gather*}...\\end{gather*}", () => {
        const input = "\\begin{gather*}\nx = 1 \\\\\ny = 2\n\\end{gather*}";
        const result = normalizeLatex(input);
        expect(result).toContain("\\begin{gathered}");
        expect(result).not.toContain("\\begin{gather*}");
    });
});

// ─── \begin{eqnarray} environments ────────────────────────────────────────────

describe("\\begin{eqnarray} environments", () => {
    it("converts standalone \\begin{eqnarray}...\\end{eqnarray} to aligned inside $$", () => {
        const input = "\\begin{eqnarray}\na &=& b \\\\\nc &=& d\n\\end{eqnarray}";
        const result = normalizeLatex(input);
        expect(result).toContain("\\begin{aligned}");
        expect(result).not.toContain("\\begin{eqnarray}");
    });

    it("converts standalone \\begin{eqnarray*}...\\end{eqnarray*}", () => {
        const input = "\\begin{eqnarray*}\nx &=& 1\n\\end{eqnarray*}";
        const result = normalizeLatex(input);
        expect(result).toContain("\\begin{aligned}");
        expect(result).not.toContain("\\begin{eqnarray*}");
    });
});

// ─── Already-normalized delimiters ────────────────────────────────────────────

describe("already-normalized $ and $$ delimiters are untouched", () => {
    it("leaves $...$ inline math unchanged", () => {
        const input = "The area is $\\pi r^2$.";
        const result = normalizeLatex(input);
        expect(result).toBe("The area is $\\pi r^2$.");
    });

    it("leaves $$...$$ display math unchanged", () => {
        const input = "$$\nE = mc^2\n$$";
        const result = normalizeLatex(input);
        expect(result).toBe("$$\nE = mc^2\n$$");
    });

    it("leaves multi-line $$...$$ unchanged", () => {
        const input = "$$\na &= b \\\\\nc &= d\n$$";
        const result = normalizeLatex(input);
        expect(result).toBe("$$\na &= b \\\\\nc &= d\n$$");
    });
});

// ─── Mixed content / real AI response shapes ──────────────────────────────────

describe("mixed content (real AI response shapes)", () => {
    it("handles text with inline math in a sentence", () => {
        const input =
            "The kinetic energy is \\(KE = \\frac{1}{2}mv^2\\) where m is mass.";
        const result = normalizeLatex(input);
        expectInline(result, "KE = \\frac{1}{2}mv^2");
        expect(result).toContain("where m is mass");
    });

    it("handles paragraph text with display math", () => {
        const input =
            "The quadratic formula:\n\n\\[x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}\\]\n\nwhere a, b, c are coefficients.";
        const result = normalizeLatex(input);
        expectDisplayBlock(result, "x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}");
        expect(result).toContain("where a, b, c are coefficients");
    });

    it("handles a mix of inline and display math in one response", () => {
        const input =
            "Let \\(f(x) = x^2\\). Its derivative is \\(f'(x) = 2x\\).\n\n" +
            "The integral is:\n\\[\\int_0^1 x^2 dx = \\frac{1}{3}\\]";
        const result = normalizeLatex(input);
        expectInline(result, "f(x) = x^2");
        expectInline(result, "f'(x) = 2x");
        expectDisplayBlock(result, "\\int_0^1 x^2 dx = \\frac{1}{3}");
    });

    it("handles multiple display blocks in sequence", () => {
        const input =
            "First equation:\n\\[E = mc^2\\]\n\nSecond equation:\n\\[F = ma\\]";
        const result = normalizeLatex(input);
        expectDisplayBlock(result, "E = mc^2");
        expectDisplayBlock(result, "F = ma");
    });

    it("handles Newton's laws in mixed notation", () => {
        const input =
            "Newton's second law states \\(F = ma\\), and more precisely:\n" +
            "\\[\\vec{F} = m\\vec{a} = m\\frac{d\\vec{v}}{dt}\\]";
        const result = normalizeLatex(input);
        expectInline(result, "F = ma");
        expectDisplayBlock(result, "\\vec{F} = m\\vec{a} = m\\frac{d\\vec{v}}{dt}");
    });

    it("handles Maxwell's equations with align environment", () => {
        const input =
            "Maxwell's equations:\n" +
            "\\begin{align}\n" +
            "\\nabla \\cdot \\vec{E} &= \\frac{\\rho}{\\epsilon_0} \\\\\n" +
            "\\nabla \\cdot \\vec{B} &= 0\n" +
            "\\end{align}";
        const result = normalizeLatex(input);
        expect(result).toContain("\\begin{aligned}");
        expect(result).toContain("\\nabla \\cdot \\vec{E}");
        expect(result).toMatch(/\n\n\$\$\n[\s\S]+?\n\$\$\n\n/);
    });

    it("handles Euler's identity", () => {
        const input = "Euler's identity: \\[e^{i\\pi} + 1 = 0\\]";
        const result = normalizeLatex(input);
        expectDisplayBlock(result, "e^{i\\pi} + 1 = 0");
    });

    it("handles Schrödinger equation", () => {
        const input =
            "The time-independent Schrödinger equation:\n" +
            "\\[-\\frac{\\hbar^2}{2m}\\nabla^2\\psi + V\\psi = E\\psi\\]";
        const result = normalizeLatex(input);
        expectDisplayBlock(
            result,
            "-\\frac{\\hbar^2}{2m}\\nabla^2\\psi + V\\psi = E\\psi",
        );
    });

    it("handles Fourier transform definition", () => {
        const input =
            "The Fourier transform is:\n" +
            "\\[\\hat{f}(\\xi) = \\int_{-\\infty}^{\\infty} f(x) e^{-2\\pi i x \\xi} dx\\]";
        const result = normalizeLatex(input);
        expectDisplayBlock(
            result,
            "\\hat{f}(\\xi) = \\int_{-\\infty}^{\\infty} f(x) e^{-2\\pi i x \\xi} dx",
        );
    });

    it("handles system of equations with align*", () => {
        const input =
            "\\begin{align*}\n2x + 3y &= 7 \\\\\nx - y &= 1\n\\end{align*}";
        const result = normalizeLatex(input);
        expect(result).toContain("\\begin{aligned}");
        expect(result).toContain("2x + 3y");
        expect(result).toContain("x - y");
    });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("edge cases", () => {
    it("handles empty input", () => {
        expect(normalizeLatex("")).toBe("");
    });

    it("handles plain text without any math", () => {
        const input = "This is just plain text without any formulas.";
        expect(normalizeLatex(input)).toBe(input);
    });

    it("handles text with only whitespace", () => {
        expect(normalizeLatex("   ")).toBe("   ");
    });

    it("does not crash on deeply nested braces", () => {
        const input = "\\[\\frac{\\frac{a}{b}}{\\frac{c}{d}}\\]";
        expect(() => normalizeLatex(input)).not.toThrow();
        const result = normalizeLatex(input);
        expectDisplayBlock(result, "\\frac{\\frac{a}{b}}{\\frac{c}{d}}");
    });

    it("does not crash on backslashes without math delimiters", () => {
        const input = "Use \\text{this} and \\textbf{that}.";
        expect(() => normalizeLatex(input)).not.toThrow();
    });

    it("handles inline math immediately adjacent to text", () => {
        const result = normalizeLatex("Value:\\(x\\)end");
        expect(result).toContain("$x$");
    });

    it("handles \\begin{equation} with complex inner formula", () => {
        const input =
            "\\begin{equation}\n" +
            "\\int_0^\\infty \\frac{x^3}{e^x - 1} dx = \\frac{\\pi^4}{15}\n" +
            "\\end{equation}";
        const result = normalizeLatex(input);
        expectDisplayBlock(
            result,
            "\\int_0^\\infty \\frac{x^3}{e^x - 1} dx = \\frac{\\pi^4}{15}",
        );
    });

    it("handles multiline \\[...\\] with multiple formula lines", () => {
        const input =
            "\\[\n" +
            "a^2 + b^2 = c^2 \\\\\n" +
            "(a+b)^2 = a^2 + 2ab + b^2\n" +
            "\\]";
        const result = normalizeLatex(input);
        expect(result).toContain("a^2 + b^2 = c^2");
        expect(result).toContain("(a+b)^2 = a^2 + 2ab + b^2");
        expect(result).toMatch(/\n\n\$\$\n/);
    });

    it("produces valid remark-math block format: $$ on own line", () => {
        const result = normalizeLatex("\\[x = 1\\]");
        const lines = result.split("\n");
        const openIdx = lines.findIndex((l) => l === "$$");
        const closeIdx = lines.findLastIndex((l) => l === "$$");
        expect(openIdx).toBeGreaterThanOrEqual(0);
        expect(closeIdx).toBeGreaterThan(openIdx);
        // Lines before open $$ should be blank (the \n\n padding)
        expect(lines[openIdx - 1]).toBe("");
        // Lines after close $$ should be blank
        expect(lines[closeIdx + 1]).toBe("");
    });
});

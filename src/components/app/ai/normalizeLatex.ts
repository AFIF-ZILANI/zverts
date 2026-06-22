/**
 * Converts all common LaTeX math notation variants to the $/$$  delimiters
 * that remark-math understands.
 *
 * Handles:
 *   \[...\]                                → display block  ($$\n...\n$$)
 *   \(...\)                                → inline         ($...$)
 *   \begin{equation}  / \begin{equation*}  → display block
 *   \begin{align}     / \begin{align*}     → display block  (with \begin{aligned})
 *   \begin{gather}    / \begin{gather*}    → display block  (with \begin{gathered})
 *   \begin{eqnarray}  / \begin{eqnarray*} → display block  (with \begin{aligned})
 *
 * Already-valid $...$ and $$...$$ delimiters are left untouched.
 */
export function normalizeLatex(text: string): string {
    return (
        text
            // \[...\] → display block.
            // Inside the block, also fix environment names that KaTeX requires:
            //   align / align*      → aligned
            //   eqnarray / eqnarray* → aligned
            //   gather / gather*    → gathered
            .replace(/\\\[([\s\S]+?)\\\]/g, (_, inner: string) => {
                const fixed = inner
                    .trim()
                    .replace(/\\begin\{align\*?\}/g, "\\begin{aligned}")
                    .replace(/\\end\{align\*?\}/g, "\\end{aligned}")
                    .replace(/\\begin\{eqnarray\*?\}/g, "\\begin{aligned}")
                    .replace(/\\end\{eqnarray\*?\}/g, "\\end{aligned}")
                    .replace(/\\begin\{gather\*?\}/g, "\\begin{gathered}")
                    .replace(/\\end\{gather\*?\}/g, "\\end{gathered}");
                return `\n\n$$\n${fixed}\n$$\n\n`;
            })
            // \(...\) → inline math (trim inner whitespace so $  x  $ → $x$)
            .replace(/\\\(([\s\S]+?)\\\)/g, (_, inner: string) => `$${inner.trim()}$`)
            // Standalone \begin{equation}...\end{equation}
            .replace(
                /\\begin\{equation\*?\}([\s\S]+?)\\end\{equation\*?\}/g,
                (_, inner: string) => `\n\n$$\n${inner.trim()}\n$$\n\n`,
            )
            // Standalone \begin{align}...\end{align}
            .replace(
                /\\begin\{align\*?\}([\s\S]+?)\\end\{align\*?\}/g,
                (_, inner: string) =>
                    `\n\n$$\n\\begin{aligned}\n${inner.trim()}\n\\end{aligned}\n$$\n\n`,
            )
            // Standalone \begin{gather}...\end{gather}
            .replace(
                /\\begin\{gather\*?\}([\s\S]+?)\\end\{gather\*?\}/g,
                (_, inner: string) =>
                    `\n\n$$\n\\begin{gathered}\n${inner.trim()}\n\\end{gathered}\n$$\n\n`,
            )
            // Standalone \begin{eqnarray}...\end{eqnarray}
            .replace(
                /\\begin\{eqnarray\*?\}([\s\S]+?)\\end\{eqnarray\*?\}/g,
                (_, inner: string) =>
                    `\n\n$$\n\\begin{aligned}\n${inner.trim()}\n\\end{aligned}\n$$\n\n`,
            )
    );
}

import { useState, memo } from "react";
import type React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { normalizeLatex } from "./normalizeLatex";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism-async-light";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import js from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import ts from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import py from "react-syntax-highlighter/dist/esm/languages/prism/python";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import c from "react-syntax-highlighter/dist/esm/languages/prism/c";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import html from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
SyntaxHighlighter.registerLanguage("javascript", js);
SyntaxHighlighter.registerLanguage("js", js);
SyntaxHighlighter.registerLanguage("typescript", ts);
SyntaxHighlighter.registerLanguage("ts", ts);
SyntaxHighlighter.registerLanguage("python", py);
SyntaxHighlighter.registerLanguage("py", py);
SyntaxHighlighter.registerLanguage("cpp", cpp);
SyntaxHighlighter.registerLanguage("c", c);
SyntaxHighlighter.registerLanguage("java", java);
SyntaxHighlighter.registerLanguage("html", html);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("sh", bash);
SyntaxHighlighter.registerLanguage("sql", sql);
import { Check, Copy } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const CodeBlock = ({
    language,
    value,
    isDark,
}: {
    language: string;
    value: string;
    isDark: boolean;
}) => {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <div className="my-3 rounded-xl overflow-hidden border border-border/60 bg-[hsl(var(--muted))]">
            <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider bg-muted/60 border-b border-border/60 text-muted-foreground">
                <span>{language || "text"}</span>
                <button
                    onClick={copy}
                    className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>
            <SyntaxHighlighter
                language={language || "text"}
                style={isDark ? oneDark : oneLight}
                PreTag="div"
                customStyle={{
                    margin: 0,
                    padding: "12px 14px",
                    background: "transparent",
                    fontSize: "12.5px",
                }}
                wrapLongLines={false}
            >
                {value.replace(/\n$/, "")}
            </SyntaxHighlighter>
        </div>
    );
};

function MessageContentInner({ content }: { content: string }) {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme !== "light";

    const normalized = normalizeLatex(content);

    return (
        <div className="space-y-2">
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-headings:mt-3 prose-headings:mb-2 prose-pre:p-0 prose-pre:bg-transparent prose-code:before:content-none prose-code:after:content-none">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[
                            [rehypeKatex, { throwOnError: false, strict: "ignore" }],
                        ]}
                        components={{
                            code({ inline, className, children, ...props }: React.ComponentPropsWithoutRef<"code"> & { inline?: boolean }) {
                                const match = /language-(\w+)/.exec(className || "");
                                const value = String(children).replace(/\n$/, "");
                                if (!inline && match) {
                                    return (
                                        <CodeBlock
                                            language={match[1]}
                                            value={value}
                                            isDark={isDark}
                                        />
                                    );
                                }
                                if (!inline) {
                                    return (
                                        <CodeBlock language="text" value={value} isDark={isDark} />
                                    );
                                }
                                return (
                                    <code
                                        className="rounded bg-muted px-1.5 py-0.5 text-[0.85em] font-mono"
                                        {...props}
                                    >
                                        {children}
                                    </code>
                                );
                            },
                        }}
                    >
                        {normalized}
                    </ReactMarkdown>
                </div>
        </div>
    );
}

export const MessageContent = memo(MessageContentInner);

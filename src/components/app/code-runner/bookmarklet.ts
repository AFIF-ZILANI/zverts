import { toProblem, type Problem } from "./companion";

/**
 * Runs on the problem page (Codeforces, AtCoder, CodeChef… ) from the
 * "Send to Zverts" bookmark. It is turned into a string with toString(), so it
 * must stay self-contained: no imports, no outer variables.
 */
export function extractProblem(doc: Document, url: string) {
    const text = (el: Element) => {
        // Codeforces splits each line of a sample into its own div.
        const lines = el.querySelectorAll(".test-example-line");
        const t = lines.length
            ? Array.from(lines, (l) => l.textContent ?? "").join("\n")
            : ((el as HTMLElement).innerText ?? el.textContent ?? "");
        return t.replace(/\r\n?/g, "\n").replace(/\n*$/, "\n");
    };
    const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
    const tests: { input: string; output: string }[] = [];
    let name = "";

    // Samples listed input, output, input, output…
    const pairs = (pres: ArrayLike<Element>) => {
        for (let i = 0; i + 1 < pres.length; i += 2)
            tests.push({ input: text(pres[i]), output: text(pres[i + 1]) });
    };

    const cf = doc.querySelectorAll(".sample-test");
    const atSel = "pre[id^='pre-sample']";
    const cc = doc.querySelectorAll("[class*='_input_output__table']");
    if (cf.length) {
        // Codeforces (problemset, contest, gym)
        name = clean(doc.querySelector(".problem-statement .title")?.textContent);
        cf.forEach((box) => {
            const ins = box.querySelectorAll(".input pre");
            const outs = box.querySelectorAll(".output pre");
            ins.forEach((pre, i) => {
                if (outs[i]) tests.push({ input: text(pre), output: text(outs[i]) });
            });
        });
    } else if (doc.querySelector(`#task-statement ${atSel}`)) {
        // AtCoder: the statement is there twice (Japanese and English); take one.
        const en = doc.querySelectorAll(`#task-statement .lang-en ${atSel}`);
        const ja = doc.querySelectorAll(`#task-statement .lang-ja ${atSel}`);
        pairs(en.length ? en : ja.length ? ja : doc.querySelectorAll(`#task-statement ${atSel}`));
        name = clean(doc.title);
    } else if (cc.length) {
        // CodeChef: one Input/Output table per sample.
        cc.forEach((table) => pairs(table.querySelectorAll("pre")));
        name =
            clean(doc.querySelector("h1")?.textContent) ||
            clean(doc.title).replace(/ Practice Coding Problem$/i, "");
    } else {
        // Anything else: each <pre> labelled "…Input…" / "…Output…" by the
        // nearest text before it.
        const labelOf = (pre: Element) => {
            let el: Element | null = pre;
            for (let depth = 0; el && depth < 4; depth++, el = el.parentElement) {
                for (let s = el.previousElementSibling; s; s = s.previousElementSibling) {
                    const t = clean(s.textContent).toLowerCase();
                    if (t && t !== "copy") return t.slice(0, 60);
                }
            }
            return "";
        };
        const inputs: string[] = [];
        const outputs: string[] = [];
        doc.body.querySelectorAll("pre").forEach((pre) => {
            const label = labelOf(pre);
            if (/format|specification/.test(label)) return;
            if (/input/.test(label)) inputs.push(text(pre));
            else if (/output/.test(label)) outputs.push(text(pre));
        });
        inputs.forEach((input, i) => {
            if (outputs[i] !== undefined) tests.push({ input, output: outputs[i] });
        });
        name = clean(doc.querySelector("h1")?.textContent) || clean(doc.title);
    }
    return { name: (name || clean(doc.title) || "problem").slice(0, 100), url, tests };
}

/** Registered by the installed app (public/manifest.json protocol_handlers). */
export const APP_PROTOCOL = "web+zverts";

/** Where the bookmark sends a problem: the installed desktop app, or a browser tab. */
export type BookmarkTarget = "app" | "tab";

/** The bookmark's address: extract on the problem page, then hand the problem to Zverts. */
export const bookmarkletHref = (origin: string, target: BookmarkTarget = "tab") =>
    "javascript:" +
    encodeURIComponent(
        `(function(){var p=(${extractProblem.toString()})(document,location.href);` +
            `if(!p.tests.length){alert("Zverts: no sample tests found on this page.");return;}` +
            `var d=encodeURIComponent(JSON.stringify(p));` +
            (target === "app"
                ? // The OS hands web+zverts: links to the installed app; its open window
                  // takes them (manifest launch_handler), so no new window or tab.
                  `location.href=${JSON.stringify(`${APP_PROTOCOL}:`)}+d;`
                : // Named window: the first click opens the editor, later clicks reuse that tab.
                  `window.open(${JSON.stringify(`${origin}/code#cph=`)}+d,"zverts-code");`) +
            `})()`,
    );

/**
 * "#cph=<problem>" from a URL the app was opened with: the bookmark's /code#cph=…,
 * or a protocol launch, /code?cph=web+zverts:<problem>.
 */
export const cphHashFrom = (url: string): string | null => {
    try {
        const u = new URL(url);
        const launched = /^web[+ ]zverts:([\s\S]*)$/.exec(u.searchParams.get("cph") ?? "");
        if (launched) return `#cph=${launched[1]}`;
        return u.hash.startsWith("#cph=") ? u.hash : null;
    } catch {
        return null;
    }
};

/** A problem sent by the bookmark in this page's URL, removed from the URL once read. */
export const takeHashProblem = (): Problem | null => {
    const hash = cphHashFrom(location.href);
    if (!hash) return null;
    const u = new URL(location.href);
    u.searchParams.delete("cph");
    // Keep history.state: React Router keeps its own bookkeeping there.
    history.replaceState(history.state, "", u.pathname + u.search);
    try {
        // Anyone can craft such a link: toProblem keeps only well-formed data.
        return toProblem(JSON.parse(decodeURIComponent(hash.slice("#cph=".length))));
    } catch {
        return null;
    }
};

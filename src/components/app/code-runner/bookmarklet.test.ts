import { describe, expect, it } from "vitest";
import { bookmarkletHref, extractProblem, takeHashProblem } from "./bookmarklet";

const page = (html: string, title = "") => {
    const doc = document.implementation.createHTMLDocument(title);
    doc.body.innerHTML = html;
    return doc;
};

describe("extractProblem", () => {
    it("reads Codeforces samples, one div per line", () => {
        const doc = page(`
            <div class="problem-statement">
              <div class="header"><div class="title">A. Watermelon</div></div>
              <div class="sample-test">
                <div class="input"><div class="title">Input</div>
                  <pre><div class="test-example-line">2</div><div class="test-example-line">1 2</div></pre></div>
                <div class="output"><div class="title">Output</div><pre>YES
</pre></div>
              </div>
            </div>`);
        expect(extractProblem(doc, "https://codeforces.com/problemset/problem/4/A")).toEqual({
            name: "A. Watermelon",
            url: "https://codeforces.com/problemset/problem/4/A",
            tests: [{ input: "2\n1 2\n", output: "YES\n" }],
        });
    });

    it("reads AtCoder samples from the English statement only", () => {
        const doc = page(
            `<div id="task-statement">
               <span class="lang-ja"><div class="part"><section><h3>入力例 1</h3>
                 <div class="div-btn-copy">Copy</div><pre id="pre-sample0">9</pre></section></div></span>
               <span class="lang-en">
                 <div class="part"><section><h3>Input</h3><pre>N</pre></section></div>
                 <div class="part"><section><h3>Sample Input 1</h3>
                   <div class="div-btn-copy">Copy</div><pre id="pre-sample2">3 4</pre></section></div>
                 <div class="part"><section><h3>Sample Output 1</h3>
                   <div class="div-btn-copy">Copy</div><pre id="pre-sample3">7</pre></section></div>
               </span>
             </div>`,
            "A - Sum",
        );
        const p = extractProblem(doc, "https://atcoder.jp/contests/abc1/tasks/abc1_a");
        expect(p.name).toBe("A - Sum");
        expect(p.tests).toEqual([{ input: "3 4\n", output: "7\n" }]);
    });

    it("reads CodeChef's Input/Output tables", () => {
        const doc = page(
            `<h3>Sample 1:</h3>
             <div class="_input_output__table_bh3c4_231">
               <div class="_values__container_x"><div class="_values_x"><pre>3
1 2</pre></div><div class="_values_x"><pre>3</pre></div></div>
             </div>`,
            "Add Two Numbers Practice Coding Problem",
        );
        const p = extractProblem(doc, "https://www.codechef.com/problems/FLOW001");
        expect(p.name).toBe("Add Two Numbers");
        expect(p.tests).toEqual([{ input: "3\n1 2\n", output: "3\n" }]);
    });

    it("falls back to <pre>s labelled Input / Output", () => {
        const doc = page(
            `<h1>Echo</h1><h4>Input format</h4><pre>N</pre>
             <h4>Example input</h4><pre>5</pre><h4>Example output</h4><pre>5</pre>`,
        );
        expect(extractProblem(doc, "u")).toEqual({
            name: "Echo",
            url: "u",
            tests: [{ input: "5\n", output: "5\n" }],
        });
    });

    it("finds nothing on a page without samples", () => {
        expect(extractProblem(page("<p>hello</p>", "x"), "u").tests).toEqual([]);
    });
});

describe("bookmarkletHref", () => {
    it("is a self-contained javascript: URL that opens the editor", () => {
        const href = bookmarkletHref("https://zverts.test");
        expect(href.startsWith("javascript:")).toBe(true);
        const code = decodeURIComponent(href.slice("javascript:".length));
        expect(code).toContain('"https://zverts.test/code#cph="');
        // It must parse as JavaScript on its own.
        expect(() => new Function(code)).not.toThrow();
    });
});

describe("takeHashProblem", () => {
    it("reads and clears the problem from the hash", () => {
        const p = { name: "A. Sum", url: "u", tests: [{ input: "1\n", output: "1\n" }] };
        history.replaceState(null, "", `/code#cph=${encodeURIComponent(JSON.stringify(p))}`);
        expect(takeHashProblem()).toEqual(p);
        expect(location.hash).toBe("");
    });
    it("ignores junk", () => {
        history.replaceState(null, "", "/code#cph=%7Bnot-json");
        expect(takeHashProblem()).toBeNull();
        history.replaceState(null, "", "/code#other");
        expect(takeHashProblem()).toBeNull();
    });
});

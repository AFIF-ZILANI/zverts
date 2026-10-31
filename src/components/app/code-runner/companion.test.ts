import { describe, expect, it } from "vitest";
import { sameOutput, toProblem } from "./companion";

describe("toProblem", () => {
    it("keeps a Competitive Companion problem", () => {
        const p = toProblem({
            name: " A. Watermelon ",
            url: "https://codeforces.com/problemset/problem/4/A",
            tests: [{ input: "8\n", output: "YES\n" }, { input: 1 }],
        });
        expect(p).toEqual({
            name: "A. Watermelon",
            url: "https://codeforces.com/problemset/problem/4/A",
            tests: [{ input: "8\n", output: "YES\n" }],
        });
    });
    it("drops junk", () => {
        expect(toProblem(null)).toBeNull();
        expect(toProblem({ name: "x" })).toBeNull();
        expect(toProblem({ name: "", tests: [] })).toBeNull();
    });
});

describe("sameOutput", () => {
    it("ignores trailing spaces, CRLF and final blank lines", () => {
        expect(sameOutput("1 2 \r\n3\n\n", "1 2\n3")).toBe(true);
    });
    it("still sees real differences", () => {
        expect(sameOutput("1 2\n3", "1 2 3")).toBe(false);
        expect(sameOutput(" 1", "1")).toBe(false);
    });
});

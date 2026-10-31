import { describe, expect, it, vi } from "vitest";

vi.mock("./monaco", () => ({ monaco: {} }));
const { langOf, uniqueName, validName } = await import("./files");

const file = (name: string, id = name) => ({ id, name, content: "" });

describe("langOf", () => {
    it("maps extensions to runnable languages", () => {
        expect(langOf("main.c")).toBe("c");
        expect(langOf("a.CPP")).toBe("cpp");
        expect(langOf("x.cc")).toBe("cpp");
        expect(langOf("s.py")).toBe("python");
        expect(langOf("notes.txt")).toBeNull();
        expect(langOf("c")).toBeNull();
    });
});

describe("validName", () => {
    const files = [file("main.cpp", "1")];
    it("rejects empty, bad characters and duplicates (any case)", () => {
        expect(validName("  ", files)).not.toBeNull();
        expect(validName("a/b.c", files)).not.toBeNull();
        expect(validName("MAIN.cpp", files)).not.toBeNull();
    });
    it("allows a new name, or a file keeping its own", () => {
        expect(validName("sum.py", files)).toBeNull();
        expect(validName("main.cpp", files, "1")).toBeNull();
    });
});

describe("uniqueName", () => {
    it("numbers clashes before the extension", () => {
        expect(uniqueName("main.cpp", [file("main.cpp")])).toBe("main (2).cpp");
        expect(uniqueName("main.cpp", [file("main.cpp"), file("main (2).cpp")])).toBe(
            "main (3).cpp",
        );
        expect(uniqueName("new.py", [file("main.cpp")])).toBe("new.py");
    });
});

describe("problemFileName", () => {
    it("turns a problem title into a file name", async () => {
        const { problemFileName } = await import("./files");
        expect(problemFileName("A. Watermelon", "cpp")).toBe("A_Watermelon.cpp");
        expect(problemFileName("B: Sum / Product?", "py")).toBe("B_Sum_Product.py");
        expect(problemFileName("...", "c")).toBe("problem.c");
    });
});

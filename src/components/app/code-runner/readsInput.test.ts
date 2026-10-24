import { describe, expect, it } from "vitest";
import { readsInput } from "./readsInput";

describe("readsInput", () => {
    it.each([
        ["c", '#include <stdio.h>\nint main(){int a; scanf("%d",&a);}', "scanf"],
        ["c", "int main(){ char s[9]; fgets(s, 9, stdin); }", "fgets"],
        ["c", "int main(){ int c = getchar(); }", "getchar"],
        ["cpp", "#include <iostream>\nint main(){int n; std::cin >> n;}", "cin"],
        ["cpp", "int main(){ string s; getline(cin, s); }", "getline"],
        ["python", "n = int(input())", "input"],
        ["python", "import sys\ndata = sys.stdin.read()", "sys.stdin"],
        ["python", "x = open(0).read()", "open(0)"],
    ] as const)("%s: finds the input call", (lang, code, call) => {
        expect(readsInput(lang, code)).toBe(call);
    });

    it.each([
        ["c", 'int main(){ printf("use scanf here"); } // scanf'],
        ["c", "/* cin >> x */ int main(){ return 0; }"],
        ["cpp", '#include <iostream>\nint main(){ std::cout << "cin" << std::endl; }'],
        ["cpp", "int main(){ char c = 'x'; }"],
        ["python", 'print("input()")  # input()'],
        ["python", '"""\ninput()\n"""\nprint(1)'],
        ["python", "def my_input(): pass\nprint(1)"],
    ] as const)("%s: ignores comments, strings and look-alikes", (lang, code) => {
        expect(readsInput(lang, code)).toBeNull();
    });
});

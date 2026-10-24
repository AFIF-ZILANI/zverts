export type RunLanguage = "c" | "cpp" | "python";

export const LANGUAGES: { id: RunLanguage; label: string; file: string; monaco: string }[] = [
    { id: "c", label: "C", file: "main.c", monaco: "c" },
    { id: "cpp", label: "C++", file: "main.cpp", monaco: "cpp" },
    { id: "python", label: "Python", file: "main.py", monaco: "python" },
];

export const TEMPLATES: Record<RunLanguage, string> = {
    c: `#include <stdio.h>

int main(void) {
    char name[100];
    if (scanf("%99s", name) == 1)
        printf("Hello, %s!\\n", name);
    else
        printf("Hello, World!\\n");
    return 0;
}
`,
    cpp: `#include <iostream>
#include <string>
using namespace std;

int main() {
    string name;
    if (cin >> name)
        cout << "Hello, " << name << "!" << endl;
    else
        cout << "Hello, World!" << endl;
    return 0;
}
`,
    python: `import sys

name = sys.stdin.readline().strip() or "World"
print(f"Hello, {name}!")
`,
};

export interface RunResult {
    status: { id: number; description: string };
    stdout: string;
    stderr: string;
    compileOutput: string;
    message: string;
    time: number | null;
    memory: number | null;
}

// Judge0 status ids: 3 = Accepted; 6 = Compilation Error; 5 = Time Limit Exceeded.
export const ACCEPTED = 3;

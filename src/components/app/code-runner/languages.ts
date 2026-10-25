export type RunLanguage = "c" | "cpp" | "python";

export const LANGUAGES: { id: RunLanguage; label: string; file: string; monaco: string }[] = [
    { id: "c", label: "C", file: "main.c", monaco: "c" },
    { id: "cpp", label: "C++", file: "main.cpp", monaco: "cpp" },
    { id: "python", label: "Python", file: "main.py", monaco: "python" },
];

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

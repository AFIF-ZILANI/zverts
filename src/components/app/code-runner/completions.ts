// IntelliSense-style suggestions for the code runner, without a language
// server: keywords, snippets, the standard library a beginner uses, member
// lists after "." (guessed from how the variable was declared), and the
// identifiers already in the file.
import type * as Monaco from "monaco-editor/editor/editor.api.js";

type M = typeof Monaco;
// [name, signature or short detail, documentation]
type Entry = [string, string, string];
// [label, snippet body, description]
type Snippet = [string, string, string];

// ── C / C++ ──

const C_KEYWORDS =
    "auto break case char const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while bool true false NULL".split(
        " ",
    );
const CPP_KEYWORDS = [
    ...C_KEYWORDS.filter((k) => k !== "NULL"),
    ..."class namespace using template typename public private protected virtual new delete this nullptr try catch throw operator friend inline constexpr explicit override const_cast static_cast".split(
        " ",
    ),
];

const C_FUNCTIONS: Entry[] = [
    [
        "printf",
        "int printf(const char *format, ...)",
        "Print formatted output. %d int, %lld long long, %f double, %c char, %s string.",
    ],
    [
        "scanf",
        "int scanf(const char *format, ...)",
        'Read formatted input. Pass addresses: scanf("%d", &n).',
    ],
    ["puts", "int puts(const char *s)", "Print a string followed by a newline."],
    ["getchar", "int getchar(void)", "Read one character from input (EOF at the end)."],
    ["putchar", "int putchar(int c)", "Print one character."],
    [
        "fgets",
        "char *fgets(char *s, int n, FILE *stream)",
        "Read a line (up to n-1 chars) — use stdin as the stream.",
    ],
    ["strlen", "size_t strlen(const char *s)", "Length of a string (without the '\\0')."],
    ["strcpy", "char *strcpy(char *dest, const char *src)", "Copy src into dest."],
    [
        "strcmp",
        "int strcmp(const char *a, const char *b)",
        "Compare strings: 0 if equal, <0 if a<b, >0 if a>b.",
    ],
    ["strcat", "char *strcat(char *dest, const char *src)", "Append src to the end of dest."],
    [
        "memset",
        "void *memset(void *p, int value, size_t n)",
        "Fill n bytes with value (e.g. zero an array).",
    ],
    [
        "malloc",
        "void *malloc(size_t size)",
        "Allocate size bytes on the heap. Free it with free().",
    ],
    [
        "calloc",
        "void *calloc(size_t count, size_t size)",
        "Allocate a zero-filled array of count elements.",
    ],
    ["free", "void free(void *p)", "Release memory from malloc/calloc."],
    [
        "qsort",
        "void qsort(void *base, size_t n, size_t size, int (*cmp)(const void *, const void *))",
        "Sort an array with a compare function.",
    ],
    ["abs", "int abs(int x)", "Absolute value of an int."],
    ["rand", "int rand(void)", "Pseudo-random number between 0 and RAND_MAX."],
    ["srand", "void srand(unsigned seed)", "Seed rand(), e.g. srand(time(NULL))."],
    ["exit", "void exit(int status)", "End the program with a status code."],
    ["sqrt", "double sqrt(double x)", "Square root (math.h)."],
    ["pow", "double pow(double base, double exp)", "base raised to exp (math.h)."],
    ["fabs", "double fabs(double x)", "Absolute value of a double (math.h)."],
    ["floor", "double floor(double x)", "Round down (math.h)."],
    ["ceil", "double ceil(double x)", "Round up (math.h)."],
    ["time", "time_t time(time_t *t)", "Current time; time(NULL)."],
];

const C_HEADERS = "stdio.h stdlib.h string.h math.h stdbool.h ctype.h time.h limits.h".split(" ");
const CPP_HEADERS =
    "bits/stdc++.h iostream vector string algorithm map set unordered_map unordered_set queue stack deque cmath iomanip numeric climits utility functional sstream cstring cstdio".split(
        " ",
    );

const STD: Entry[] = [
    ["cout", "std::ostream cout", "Standard output: cout << x << endl;"],
    ["cin", "std::istream cin", "Standard input: cin >> x;"],
    ["endl", "endl", 'Newline and flush. "\\n" is faster in loops.'],
    ["cerr", "std::ostream cerr", "Standard error output."],
    ["getline", "getline(cin, str)", "Read a whole line, including spaces."],
    ["vector", "template<class T> class vector", "Dynamic array: vector<int> v(n);"],
    ["string", "class string", "Text string with size(), substr(), find()…"],
    ["map", "template<class K, class V> class map", "Sorted key → value dictionary."],
    [
        "unordered_map",
        "template<class K, class V> class unordered_map",
        "Hash table key → value (faster, unsorted).",
    ],
    ["set", "template<class T> class set", "Sorted unique values."],
    ["unordered_set", "template<class T> class unordered_set", "Hash set of unique values."],
    ["multiset", "template<class T> class multiset", "Sorted values, duplicates allowed."],
    ["pair", "template<class A, class B> struct pair", "Two values: p.first, p.second."],
    ["make_pair", "make_pair(a, b)", "Build a pair."],
    ["queue", "template<class T> class queue", "FIFO: push(), front(), pop()."],
    ["stack", "template<class T> class stack", "LIFO: push(), top(), pop()."],
    ["deque", "template<class T> class deque", "Double-ended queue."],
    ["priority_queue", "template<class T> class priority_queue", "Max-heap: push(), top(), pop()."],
    ["sort", "sort(first, last[, comp])", "Sort a range: sort(v.begin(), v.end());"],
    ["reverse", "reverse(first, last)", "Reverse a range."],
    ["max", "max(a, b)", "Larger of two values."],
    ["min", "min(a, b)", "Smaller of two values."],
    ["swap", "swap(a, b)", "Exchange two values."],
    ["find", "find(first, last, value)", "Iterator to the first match (or last)."],
    ["count", "count(first, last, value)", "How many elements equal value."],
    ["accumulate", "accumulate(first, last, init)", "Sum of a range (numeric)."],
    ["lower_bound", "lower_bound(first, last, value)", "First element ≥ value in a sorted range."],
    ["upper_bound", "upper_bound(first, last, value)", "First element > value in a sorted range."],
    ["unique", "unique(first, last)", "Remove consecutive duplicates (sort first)."],
    ["next_permutation", "next_permutation(first, last)", "Next lexicographic permutation."],
    ["iota", "iota(first, last, start)", "Fill with start, start+1, …"],
    ["fixed", "fixed", "Fixed-point output for floating numbers."],
    ["setprecision", "setprecision(n)", "Digits after the point (with fixed). iomanip."],
    ["to_string", "to_string(x)", "Number → string."],
    ["stoi", "stoi(str)", "string → int."],
    ["stoll", "stoll(str)", "string → long long."],
    ["abs", "abs(x)", "Absolute value."],
    ["greater", "greater<T>()", "Comparator for descending sort / min-heap."],
];

const CPP_MEMBERS: Record<string, Entry[]> = {
    vector: [
        ["push_back", "void push_back(const T& x)", "Add x at the end."],
        ["emplace_back", "void emplace_back(args...)", "Construct an element at the end."],
        ["pop_back", "void pop_back()", "Remove the last element."],
        ["size", "size_t size()", "Number of elements."],
        ["empty", "bool empty()", "True if there are no elements."],
        ["clear", "void clear()", "Remove all elements."],
        ["begin", "iterator begin()", "Iterator to the first element."],
        ["end", "iterator end()", "Iterator past the last element."],
        ["front", "T& front()", "First element."],
        ["back", "T& back()", "Last element."],
        ["at", "T& at(size_t i)", "Element i with bounds checking."],
        ["insert", "iterator insert(iterator pos, const T& x)", "Insert x before pos."],
        ["erase", "iterator erase(iterator pos)", "Remove the element at pos."],
        ["resize", "void resize(size_t n)", "Change the size to n."],
        ["assign", "void assign(size_t n, const T& x)", "Replace contents with n copies of x."],
    ],
    string: [
        ["size", "size_t size()", "Number of characters."],
        ["length", "size_t length()", "Number of characters."],
        [
            "substr",
            "string substr(size_t pos, size_t len)",
            "Part of the string from pos, len characters.",
        ],
        ["find", "size_t find(const string& s)", "Index of s, or string::npos."],
        ["push_back", "void push_back(char c)", "Add a character at the end."],
        ["pop_back", "void pop_back()", "Remove the last character."],
        ["append", "string& append(const string& s)", "Add s at the end."],
        ["empty", "bool empty()", "True if the string is empty."],
        ["c_str", "const char* c_str()", "C-style string for printf etc."],
        ["begin", "iterator begin()", "Iterator to the first character."],
        ["end", "iterator end()", "Iterator past the last character."],
        ["front", "char& front()", "First character."],
        ["back", "char& back()", "Last character."],
        ["insert", "string& insert(size_t pos, const string& s)", "Insert s at pos."],
        ["erase", "string& erase(size_t pos, size_t len)", "Remove len characters from pos."],
        [
            "replace",
            "string& replace(size_t pos, size_t len, const string& s)",
            "Replace a part with s.",
        ],
    ],
    map: [
        ["insert", "insert({key, value})", "Add a key/value pair."],
        ["find", "iterator find(const K& key)", "Iterator to key, or end()."],
        ["count", "size_t count(const K& key)", "1 if key exists, else 0."],
        ["erase", "size_t erase(const K& key)", "Remove key."],
        ["size", "size_t size()", "Number of keys."],
        ["empty", "bool empty()", "True if empty."],
        ["clear", "void clear()", "Remove everything."],
        ["begin", "iterator begin()", "Iterator to the smallest key."],
        ["end", "iterator end()", "Iterator past the last key."],
        ["lower_bound", "iterator lower_bound(const K& key)", "First key ≥ key."],
        ["upper_bound", "iterator upper_bound(const K& key)", "First key > key."],
    ],
    set: [
        ["insert", "insert(const T& x)", "Add x (ignored if present)."],
        ["find", "iterator find(const T& x)", "Iterator to x, or end()."],
        ["count", "size_t count(const T& x)", "1 if x exists, else 0."],
        ["erase", "size_t erase(const T& x)", "Remove x."],
        ["size", "size_t size()", "Number of elements."],
        ["empty", "bool empty()", "True if empty."],
        ["clear", "void clear()", "Remove everything."],
        ["begin", "iterator begin()", "Iterator to the smallest element."],
        ["end", "iterator end()", "Iterator past the last element."],
        ["lower_bound", "iterator lower_bound(const T& x)", "First element ≥ x."],
        ["upper_bound", "iterator upper_bound(const T& x)", "First element > x."],
    ],
    queue: [
        ["push", "void push(const T& x)", "Add x at the back."],
        ["pop", "void pop()", "Remove the front element."],
        ["front", "T& front()", "Front element."],
        ["back", "T& back()", "Back element."],
        ["size", "size_t size()", "Number of elements."],
        ["empty", "bool empty()", "True if empty."],
    ],
    stack: [
        ["push", "void push(const T& x)", "Put x on top."],
        ["pop", "void pop()", "Remove the top element."],
        ["top", "T& top()", "Top element."],
        ["size", "size_t size()", "Number of elements."],
        ["empty", "bool empty()", "True if empty."],
    ],
    deque: [
        ["push_back", "void push_back(const T& x)", "Add at the back."],
        ["push_front", "void push_front(const T& x)", "Add at the front."],
        ["pop_back", "void pop_back()", "Remove from the back."],
        ["pop_front", "void pop_front()", "Remove from the front."],
        ["front", "T& front()", "Front element."],
        ["back", "T& back()", "Back element."],
        ["size", "size_t size()", "Number of elements."],
        ["empty", "bool empty()", "True if empty."],
        ["clear", "void clear()", "Remove everything."],
    ],
    pair: [
        ["first", "A first", "The first value."],
        ["second", "B second", "The second value."],
    ],
};
CPP_MEMBERS.unordered_map = CPP_MEMBERS.map.filter(([n]) => !n.endsWith("_bound"));
CPP_MEMBERS.unordered_set = CPP_MEMBERS.set.filter(([n]) => !n.endsWith("_bound"));
CPP_MEMBERS.multiset = CPP_MEMBERS.set;
CPP_MEMBERS.priority_queue = CPP_MEMBERS.stack.map(([n, s, d]) =>
    n === "top" ? [n, s, "Largest element (max-heap)."] : [n, s, d],
);

const C_SNIPPETS: Snippet[] = [
    ["main", "int main(void) {\n\t$0\n\treturn 0;\n}", "main function"],
    ["for", "for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t$0\n}", "for loop"],
    ["while", "while (${1:condition}) {\n\t$0\n}", "while loop"],
    ["do", "do {\n\t$0\n} while (${1:condition});", "do-while loop"],
    ["if", "if (${1:condition}) {\n\t$0\n}", "if statement"],
    ["ifelse", "if (${1:condition}) {\n\t$2\n} else {\n\t$0\n}", "if-else statement"],
    [
        "switch",
        "switch (${1:value}) {\ncase ${2:1}:\n\t$0\n\tbreak;\ndefault:\n\tbreak;\n}",
        "switch statement",
    ],
    ["struct", "struct ${1:Name} {\n\t$0\n};", "struct definition"],
];
const CPP_SNIPPETS: Snippet[] = [
    ["main", "int main() {\n\t$0\n\treturn 0;\n}", "main function"],
    ...C_SNIPPETS.filter(([l]) => l !== "main"),
    ["forr", "for (auto ${1:x} : ${2:v}) {\n\t$0\n}", "range-based for loop"],
    ["class", "class ${1:Name} {\npublic:\n\t$0\n};", "class definition"],
    ["cout <<", "cout << ${1:x} << endl;", "print with cout"],
    ["cin >>", "cin >> ${1:x};", "read with cin"],
    ["fastio", "ios::sync_with_stdio(false);\ncin.tie(nullptr);", "fast cin/cout"],
];

// ── Python ──

const PY_KEYWORDS =
    "False None True and as assert break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(
        " ",
    );

const PY_BUILTINS: Entry[] = [
    ["print", "print(*values, sep=' ', end='\\n')", "Print values."],
    ["input", "input(prompt='') -> str", "Read one line of input as a string."],
    ["len", "len(obj) -> int", "Number of items."],
    ["range", "range(start, stop[, step])", "Sequence of numbers; stop is excluded."],
    ["int", "int(x) -> int", "Convert to an integer: int(input())."],
    ["float", "float(x) -> float", "Convert to a decimal number."],
    ["str", "str(x) -> str", "Convert to text."],
    ["list", "list(iterable) -> list", "Make a list."],
    ["dict", "dict(**kwargs) -> dict", "Make a dictionary."],
    ["set", "set(iterable) -> set", "Make a set of unique values."],
    ["tuple", "tuple(iterable) -> tuple", "Make a tuple."],
    ["bool", "bool(x) -> bool", "True or False."],
    ["abs", "abs(x)", "Absolute value."],
    ["max", "max(iterable) / max(a, b, ...)", "Largest value."],
    ["min", "min(iterable) / min(a, b, ...)", "Smallest value."],
    ["sum", "sum(iterable, start=0)", "Sum of the values."],
    ["sorted", "sorted(iterable, key=None, reverse=False) -> list", "New sorted list."],
    ["reversed", "reversed(seq)", "Iterate in reverse."],
    ["enumerate", "enumerate(iterable, start=0)", "Pairs of (index, value)."],
    ["zip", "zip(*iterables)", "Walk several iterables together."],
    ["map", "map(function, iterable)", "Apply a function: list(map(int, input().split()))."],
    ["filter", "filter(function, iterable)", "Keep items where function is true."],
    ["round", "round(x, ndigits=None)", "Round a number."],
    ["type", "type(obj)", "Type of a value."],
    ["isinstance", "isinstance(obj, cls) -> bool", "Check a value's type."],
    ["ord", "ord(c) -> int", "Character → code number."],
    ["chr", "chr(i) -> str", "Code number → character."],
    ["any", "any(iterable) -> bool", "True if any item is true."],
    ["all", "all(iterable) -> bool", "True if every item is true."],
    ["pow", "pow(base, exp, mod=None)", "Power (optionally modulo)."],
    ["divmod", "divmod(a, b) -> (q, r)", "Quotient and remainder."],
    ["open", "open(file, mode='r')", "Open a file."],
];

const PY_MEMBERS: Record<string, Entry[]> = {
    list: [
        ["append", "append(x)", "Add x at the end."],
        ["extend", "extend(iterable)", "Add all items from iterable."],
        ["insert", "insert(i, x)", "Insert x at index i."],
        ["pop", "pop(i=-1)", "Remove and return the item at i (last by default)."],
        ["remove", "remove(x)", "Remove the first x."],
        ["sort", "sort(key=None, reverse=False)", "Sort in place."],
        ["reverse", "reverse()", "Reverse in place."],
        ["index", "index(x) -> int", "Index of the first x."],
        ["count", "count(x) -> int", "How many times x appears."],
        ["clear", "clear()", "Remove all items."],
        ["copy", "copy() -> list", "Shallow copy."],
    ],
    str: [
        ["split", "split(sep=None) -> list", "Split into words: input().split()."],
        ["strip", "strip(chars=None) -> str", "Remove surrounding whitespace."],
        ["join", "join(iterable) -> str", "Join strings: ' '.join(words)."],
        ["replace", "replace(old, new) -> str", "Replace text."],
        ["upper", "upper() -> str", "UPPERCASE copy."],
        ["lower", "lower() -> str", "lowercase copy."],
        ["title", "title() -> str", "Title Case copy."],
        ["find", "find(sub) -> int", "Index of sub, or -1."],
        ["count", "count(sub) -> int", "How many times sub appears."],
        ["startswith", "startswith(prefix) -> bool", "Starts with prefix?"],
        ["endswith", "endswith(suffix) -> bool", "Ends with suffix?"],
        ["isdigit", "isdigit() -> bool", "Only digits?"],
        ["isalpha", "isalpha() -> bool", "Only letters?"],
        ["format", "format(*args) -> str", "Fill {} placeholders."],
        ["lstrip", "lstrip() -> str", "Remove leading whitespace."],
        ["rstrip", "rstrip() -> str", "Remove trailing whitespace."],
    ],
    dict: [
        ["keys", "keys()", "All keys."],
        ["values", "values()", "All values."],
        ["items", "items()", "(key, value) pairs: for k, v in d.items()."],
        ["get", "get(key, default=None)", "Value for key, or default."],
        ["pop", "pop(key)", "Remove key and return its value."],
        ["update", "update(other)", "Add/overwrite from another dict."],
        ["setdefault", "setdefault(key, default)", "Get key, inserting default if missing."],
        ["clear", "clear()", "Remove everything."],
    ],
    set: [
        ["add", "add(x)", "Add x."],
        ["remove", "remove(x)", "Remove x (error if missing)."],
        ["discard", "discard(x)", "Remove x if present."],
        ["union", "union(other) -> set", "Items in either."],
        ["intersection", "intersection(other) -> set", "Items in both."],
        ["difference", "difference(other) -> set", "Items only in this set."],
        ["pop", "pop()", "Remove and return some item."],
        ["clear", "clear()", "Remove everything."],
    ],
};

const PY_MODULES: Record<string, Entry[]> = {
    math: [
        ["sqrt", "sqrt(x)", "Square root."],
        ["pow", "pow(x, y)", "x to the power y (float)."],
        ["floor", "floor(x)", "Round down."],
        ["ceil", "ceil(x)", "Round up."],
        ["gcd", "gcd(a, b)", "Greatest common divisor."],
        ["factorial", "factorial(n)", "n!"],
        ["log", "log(x, base=e)", "Logarithm."],
        ["sin", "sin(x)", "Sine (radians)."],
        ["cos", "cos(x)", "Cosine (radians)."],
        ["pi", "pi", "3.14159…"],
        ["e", "e", "2.71828…"],
        ["inf", "inf", "Infinity."],
    ],
    random: [
        ["randint", "randint(a, b)", "Random int with a ≤ n ≤ b."],
        ["random", "random()", "Random float in [0, 1)."],
        ["choice", "choice(seq)", "Random element."],
        ["shuffle", "shuffle(list)", "Shuffle in place."],
        ["randrange", "randrange(start, stop[, step])", "Random number from a range."],
        ["sample", "sample(population, k)", "k unique random elements."],
    ],
    sys: [
        ["stdin", "stdin", "Input stream: sys.stdin.readline()."],
        ["stdout", "stdout", "Output stream."],
        ["exit", "exit(code=0)", "Stop the program."],
        ["setrecursionlimit", "setrecursionlimit(n)", "Allow deeper recursion."],
        ["maxsize", "maxsize", "Largest list index (a big int)."],
    ],
    collections: [
        ["Counter", "Counter(iterable)", "Count items: Counter('hello')."],
        [
            "defaultdict",
            "defaultdict(default_factory)",
            "Dict with a default value: defaultdict(int).",
        ],
        ["deque", "deque(iterable)", "Fast queue: append, appendleft, popleft."],
        ["OrderedDict", "OrderedDict()", "Dict that remembers insertion order."],
    ],
    heapq: [
        ["heappush", "heappush(heap, item)", "Push onto a min-heap."],
        ["heappop", "heappop(heap)", "Pop the smallest item."],
        ["heapify", "heapify(list)", "Turn a list into a heap in place."],
    ],
    itertools: [
        ["permutations", "permutations(iterable, r=None)", "All orderings."],
        ["combinations", "combinations(iterable, r)", "All r-length combinations."],
        ["product", "product(*iterables, repeat=1)", "Cartesian product."],
        ["accumulate", "accumulate(iterable)", "Running totals."],
    ],
};

const PY_SNIPPETS: Snippet[] = [
    ["def", "def ${1:name}(${2:args}):\n\t${0:pass}", "function"],
    ["for", "for ${1:i} in range(${2:n}):\n\t${0:pass}", "for loop over range"],
    ["forin", "for ${1:item} in ${2:items}:\n\t${0:pass}", "for loop over items"],
    ["while", "while ${1:condition}:\n\t${0:pass}", "while loop"],
    ["if", "if ${1:condition}:\n\t${0:pass}", "if statement"],
    ["ifelse", "if ${1:condition}:\n\t${2:pass}\nelse:\n\t${0:pass}", "if-else statement"],
    ["class", "class ${1:Name}:\n\tdef __init__(self${2:, args}):\n\t\t${0:pass}", "class"],
    ["try", "try:\n\t${1:pass}\nexcept ${2:Exception} as e:\n\t${0:print(e)}", "try/except"],
    ["main", 'if __name__ == "__main__":\n\t${0:main()}', "main guard"],
    ["lc", "[${1:x} for ${2:x} in ${3:items}]", "list comprehension"],
    ["readints", "${1:nums} = list(map(int, input().split()))", "read a line of ints"],
];

// ── Helpers ──

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const docWords = (text: string, keywords: Set<string>, current: string) => {
    const counts = new Map<string, number>();
    for (const w of text.match(/[A-Za-z_]\w+/g) ?? []) counts.set(w, (counts.get(w) ?? 0) + 1);
    // The word being typed appears once (at the cursor) — don't suggest it to itself.
    if (current && counts.get(current) === 1) counts.delete(current);
    return [...counts.keys()].filter((w) => !keywords.has(w));
};

// Which C++ container a variable was declared as, e.g. `vector<int> a, b;` → vector.
const cppTypeOf = (text: string, name: string) => {
    const types = Object.keys(CPP_MEMBERS).join("|");
    const re = new RegExp(
        `\\b(${types})\\b\\s*(?:<[^;{}()]*>)?\\s*&?\\s*(?:\\w+\\s*(?:\\[[^\\]]*\\])?\\s*(?:\\([^)]*\\)|\\{[^}]*\\}|=[^,;]*)?\\s*,\\s*)*${escapeRe(name)}\\b`,
    );
    return text.match(re)?.[1];
};

// Python: guess from the last `name = …` assignment.
const pyTypeOf = (text: string, name: string) => {
    const re = new RegExp(`^\\s*${escapeRe(name)}\\s*=\\s*(.+)$`, "gm");
    let rhs: string | undefined;
    for (const m of text.matchAll(re)) rhs = m[1].trim();
    if (!rhs) return undefined;
    if (/^(\[|list\(|sorted\()|\.split\(/.test(rhs)) return "list";
    if (/^(set\()/.test(rhs)) return "set";
    if (/^(dict\(|\{\s*\}|\{[^}]*:)/.test(rhs)) return "dict";
    if (/^\{/.test(rhs)) return "set";
    if (/^([rbf]?["']|str\(|input\()/.test(rhs) || /\.(strip|lower|upper|replace)\(\)?/.test(rhs))
        return "str";
    return undefined;
};

const unionMembers = (members: Record<string, Entry[]>) => {
    const seen = new Map<string, Entry>();
    for (const [type, entries] of Object.entries(members)) {
        for (const [n, sig, doc] of entries) {
            const prev = seen.get(n);
            seen.set(n, prev ? [n, prev[1], `${prev[2]}`] : [n, sig, `${doc} (${type})`]);
        }
    }
    return [...seen.values()];
};

// What beginners reach for most: ranked above same-prefix names (cout before count).
const COMMON = new Set(
    "cout cin endl vector string printf scanf main print input range len int push_back size append split".split(
        " ",
    ),
);

// ── Registration ──

let registered = false;

export const registerCompletions = (monaco: M) => {
    if (registered) return;
    registered = true;
    const K = monaco.languages.CompletionItemKind;
    const SnippetRule = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;

    const fn = (
        e: Entry,
        kind: Monaco.languages.CompletionItemKind,
        range: Monaco.IRange,
        sort: string,
    ) => {
        const callable = /\(/.test(e[1]);
        return {
            label: e[0],
            kind,
            detail: e[1],
            documentation: e[2],
            insertText: callable ? `${e[0]}($0)` : e[0],
            insertTextRules: callable ? SnippetRule : undefined,
            // Show the parameter hint as soon as "(" is inserted.
            command: callable
                ? { id: "editor.action.triggerParameterHints", title: "" }
                : undefined,
            range,
            sortText: (COMMON.has(e[0]) ? "!" : sort) + e[0],
        };
    };
    const snippet = ([label, body, doc]: Snippet, range: Monaco.IRange) => ({
        label,
        kind: K.Snippet,
        detail: doc,
        documentation: { value: "```\n" + body.replace(/\$\{\d+:([^}]*)\}|\$\d/g, "$1") + "\n```" },
        insertText: body,
        insertTextRules: SnippetRule,
        range,
        sortText: "4" + label,
    });

    const provider = (lang: "c" | "cpp" | "python"): Monaco.languages.CompletionItemProvider => ({
        triggerCharacters: lang === "python" ? ["."] : [".", ":", "<", ">", "#"],
        provideCompletionItems(model, position) {
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            };
            const before = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);
            const text = model.getValue();
            const items: Monaco.languages.CompletionItem[] = [];

            if (lang === "python") {
                const member = before.match(/([A-Za-z_]\w*)\s*\.\s*$/);
                if (member) {
                    const name = member[1];
                    const imported = new RegExp(
                        `^\\s*import\\s+.*\\b${escapeRe(name)}\\b`,
                        "m",
                    ).test(text);
                    const entries =
                        (imported && PY_MODULES[name]) ||
                        PY_MEMBERS[pyTypeOf(text, name) ?? ""] ||
                        unionMembers(PY_MEMBERS);
                    for (const e of entries)
                        items.push(fn(e, imported ? K.Function : K.Method, range, "0"));
                    return { suggestions: items };
                }
                if (/\.\s*$/.test(before)) {
                    for (const e of unionMembers(PY_MEMBERS))
                        items.push(fn(e, K.Method, range, "0"));
                    return { suggestions: items };
                }
                if (/^\s*(import|from)\s+$/.test(before)) {
                    for (const m of Object.keys(PY_MODULES))
                        items.push({ label: m, kind: K.Module, insertText: m, range });
                    return { suggestions: items };
                }
                // Library names come with docs below; don't list them again as file words.
                const kw = new Set([...PY_KEYWORDS, ...PY_BUILTINS.map(([n]) => n)]);
                for (const w of docWords(text, kw, word.word))
                    items.push({
                        label: w,
                        kind: K.Variable,
                        insertText: w,
                        range,
                        sortText: "1" + w,
                    });
                for (const e of PY_BUILTINS) items.push(fn(e, K.Function, range, "2"));
                for (const k of PY_KEYWORDS)
                    items.push({
                        label: k,
                        kind: K.Keyword,
                        insertText: k,
                        range,
                        sortText: "3" + k,
                    });
                for (const s of PY_SNIPPETS) items.push(snippet(s, range));
                return { suggestions: items };
            }

            // C / C++
            if (/^\s*#\s*$/.test(before)) {
                for (const [label, body] of [
                    ["include", "include <$0>"],
                    ["define", "define ${1:NAME} ${0:value}"],
                ])
                    items.push({
                        label,
                        kind: K.Keyword,
                        insertText: body,
                        insertTextRules: SnippetRule,
                        range,
                    });
                return { suggestions: items };
            }
            if (/^\s*#\s*include\s*<[\w/.+]*$/.test(before)) {
                // Replace everything after "<" so "bits/st" → "bits/stdc++.h".
                const line = model.getLineContent(position.lineNumber);
                const headerRange = { ...range, startColumn: before.lastIndexOf("<") + 2 };
                const close = line.slice(word.endColumn - 1).startsWith(">") ? "" : ">";
                for (const h of lang === "c" ? C_HEADERS : [...CPP_HEADERS, ...C_HEADERS])
                    items.push({
                        label: h,
                        kind: K.File,
                        insertText: h + close,
                        range: headerRange,
                    });
                return { suggestions: items };
            }
            if (lang === "cpp" && /\bstd\s*::\s*$/.test(before)) {
                for (const e of STD) items.push(fn(e, K.Class, range, "0"));
                return { suggestions: items };
            }
            const member = before.match(/([A-Za-z_]\w*)\s*(?:\.|->)\s*$/);
            if (lang === "cpp" && (member || /(\.|->)\s*$/.test(before))) {
                const type = member ? cppTypeOf(text, member[1]) : undefined;
                const entries = (type && CPP_MEMBERS[type]) || unionMembers(CPP_MEMBERS);
                for (const e of entries) items.push(fn(e, K.Method, range, "0"));
                return { suggestions: items };
            }
            if (/(\.|->|:|<|>)\s*$/.test(before)) {
                // C struct fields etc.: only identifiers from the file.
                for (const w of docWords(text, new Set(C_KEYWORDS), word.word))
                    items.push({ label: w, kind: K.Field, insertText: w, range });
                return { suggestions: items };
            }

            const keywords = lang === "c" ? C_KEYWORDS : CPP_KEYWORDS;
            const known = new Set([
                ...keywords,
                ...C_FUNCTIONS.map(([n]) => n),
                ...(lang === "cpp" ? STD.map(([n]) => n) : []),
            ]);
            for (const w of docWords(text, known, word.word))
                items.push({ label: w, kind: K.Variable, insertText: w, range, sortText: "1" + w });
            for (const e of C_FUNCTIONS) items.push(fn(e, K.Function, range, "2"));
            if (lang === "cpp") for (const e of STD) items.push(fn(e, K.Class, range, "2"));
            for (const k of keywords)
                items.push({ label: k, kind: K.Keyword, insertText: k, range, sortText: "3" + k });
            for (const s of lang === "c" ? C_SNIPPETS : CPP_SNIPPETS) items.push(snippet(s, range));
            return { suggestions: items };
        },
    });

    // Parameter hints: the signature of the call the cursor is in, with the
    // current argument highlighted.
    const signatures = (lang: "c" | "cpp" | "python") => {
        const all =
            lang === "python"
                ? [
                      ...PY_BUILTINS,
                      ...Object.values(PY_MEMBERS).flat(),
                      ...Object.values(PY_MODULES).flat(),
                  ]
                : [
                      ...C_FUNCTIONS,
                      ...(lang === "cpp" ? [...STD, ...Object.values(CPP_MEMBERS).flat()] : []),
                  ];
        const byName = new Map<string, Entry>();
        for (const e of all) if (/\(/.test(e[1]) && !byName.has(e[0])) byName.set(e[0], e);
        return byName;
    };
    const signatureProvider = (
        lang: "c" | "cpp" | "python",
    ): Monaco.languages.SignatureHelpProvider => {
        const byName = signatures(lang);
        return {
            signatureHelpTriggerCharacters: ["(", ","],
            signatureHelpRetriggerCharacters: [","],
            provideSignatureHelp(model, position) {
                const before = model
                    .getLineContent(position.lineNumber)
                    .slice(0, position.column - 1);
                // Walk back to the innermost unclosed "(", counting top-level commas.
                let depth = 0;
                let commas = 0;
                let i = before.length - 1;
                for (; i >= 0; i--) {
                    const ch = before[i];
                    if (ch === ")") depth++;
                    else if (ch === "(") {
                        if (depth === 0) break;
                        depth--;
                    } else if (ch === "," && depth === 0) commas++;
                }
                if (i < 0) return null;
                const name = before.slice(0, i).match(/([A-Za-z_]\w*)\s*$/)?.[1];
                const entry = name && byName.get(name);
                if (!entry) return null;
                const inner = entry[1].slice(entry[1].indexOf("(") + 1, entry[1].lastIndexOf(")"));
                const params = inner
                    .split(",")
                    .map((p) => p.trim())
                    .filter(Boolean)
                    .map((label) => ({ label }));
                return {
                    value: {
                        signatures: [
                            { label: entry[1], documentation: entry[2], parameters: params },
                        ],
                        activeSignature: 0,
                        activeParameter: Math.min(commas, Math.max(params.length - 1, 0)),
                    },
                    dispose() {},
                };
            },
        };
    };

    for (const lang of ["c", "cpp", "python"] as const) {
        monaco.languages.registerCompletionItemProvider(lang, provider(lang));
        monaco.languages.registerSignatureHelpProvider(lang, signatureProvider(lang));
    }
};

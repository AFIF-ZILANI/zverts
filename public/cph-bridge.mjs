#!/usr/bin/env node
// Zverts ⇄ Competitive Companion bridge.
//
// The Competitive Companion browser extension sends a problem (name + sample
// tests) to http://localhost:27121 when you click its "+" button on Codeforces,
// AtCoder, CodeChef, LeetCode… A web page can't listen on a port, so this tiny
// server (no dependencies) holds the problem until the Zverts Code Runner picks it up.
//
// Run:  node cph-bridge.mjs          (keep the terminal open while you practise)
// Port: 27121, the one Competitive Companion uses for CPH. Close VS Code's CPH
//       while this runs, or start it with PORT=10045 and add that port in the extension.
import http from "node:http";

const PORT = Number(process.env.PORT) || 27121;
const queue = [];

const handler = (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    // Lets an https page reach this localhost server (Chrome's Private Network Access).
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    if (req.method === "OPTIONS") return res.end();

    // The Code Runner polls here and takes everything waiting.
    if (req.method === "GET" && req.url === "/zverts") {
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify(queue.splice(0)));
    }

    // Competitive Companion posts problems to "/".
    if (req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => {
            body += chunk;
            if (body.length > 5_000_000) req.destroy();
        });
        req.on("end", () => {
            try {
                const p = JSON.parse(body);
                if (queue.length >= 50) queue.shift();
                queue.push(p);
                console.log(`✔ ${p.name} — ${p.tests?.length ?? 0} tests sent to Zverts`);
            } catch {
                console.log("Ignored a request that wasn't a problem.");
            }
            res.end();
        });
        return;
    }

    res.statusCode = 404;
    res.end();
};

// Both loopback addresses: "localhost" may resolve to either. Never the network.
let listening = 0;
for (const host of ["127.0.0.1", "::1"]) {
    http.createServer(handler)
        .listen(PORT, host, () => {
            if (listening++ === 0)
                console.log(
                    `Zverts CPH bridge running on port ${PORT}.\n` +
                        `Open the Code Runner, then click Competitive Companion's "+" on a problem.`,
                );
        })
        .on("error", (e) => {
            if (e.code === "EADDRINUSE" && host === "127.0.0.1") {
                console.error(
                    `Port ${PORT} is busy. Close VS Code's CPH (it uses the same port), ` +
                        `or run with PORT=10045 and add that port in Competitive Companion.`,
                );
                process.exit(1);
            }
            // No IPv6 on this machine: 127.0.0.1 alone is fine.
        });
}

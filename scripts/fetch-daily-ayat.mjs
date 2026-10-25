// Builds src/lib/islamic/ayat.json — the ayat shown by Islamic Mode's Daily Ayah.
//
// The text is never typed by hand: every ayah is fetched from the
// api.alquran.cloud editions below, so the Arabic and the translations are
// exactly those published texts.
//   quran-uthmani  Arabic, Uthmani script
//   bn.bengali     Bangla — Muhiuddin Khan
//   en.sahih       English — Saheeh International
//
// Run after changing the lists:  node scripts/fetch-daily-ayat.mjs
import { writeFile } from "node:fs/promises";

// Encouragement, patience, hope, effort, du'a and seeking knowledge — shown
// four times as often. Each was checked to read well on its own (verses whose
// encouraging part sits at the end of an unrelated ruling were left out).
const MOTIVATIONAL = `2:45 2:152 2:153 2:155 2:186 2:201 2:286 3:8 3:134 3:139 3:200 7:56 8:46
9:51 11:115 12:87 13:11 13:28 14:7 16:97 16:128 20:25 20:114 21:87 29:69 39:9 39:10 39:53 40:60
41:30 47:7 53:39 58:11 65:3 93:3 93:5 94:5 94:6 94:7 94:8 96:1
2:214 2:218 3:26 3:142 3:160 4:110 7:23 10:62 14:40 16:127 17:80 18:10 20:46 21:83 27:62
28:24 29:2 35:2 42:43 64:11`;
// Allah's oneness and signs, reflection, character.
const GENERAL = `1:2 2:255 3:190 4:36 6:59 17:23 21:30 25:74 30:21 31:18 36:40 49:13 50:16
51:56 55:13 57:4 59:22 67:2 88:17 88:19 112:1 112:4`;

const API = "https://api.alquran.cloud/v1";
const EDITIONS = "quran-uthmani,bn.bengali,en.sahih";

const get = async (path) => {
    for (let attempt = 1; ; attempt++) {
        const res = await fetch(`${API}${path}`);
        if (res.ok) return (await res.json()).data;
        if (attempt === 3) throw new Error(`${path}: HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
};

// This API prefixes the first ayah of every surah (except Al-Fatiha and
// At-Tawba) with the Basmala, which is not part of that ayah. Take the exact
// string from 1:1 and strip it.
// Some texts start with an invisible byte-order mark (U+FEFF); drop it.
const clean = (s) => s.replace(/^\uFEFF/, "").trim();
const basmala = clean((await get("/ayah/1:1/quran-uthmani")).text);

const ayat = [];
for (const [kind, list] of [
    ["motivational", MOTIVATIONAL],
    ["general", GENERAL],
]) {
    for (const ref of list.split(/\s+/).filter(Boolean)) {
        const [ar, bn, en] = await get(`/ayah/${ref}/editions/${EDITIONS}`);
        let arabic = clean(ar.text);
        const surah = ar.surah.number;
        if (ar.numberInSurah === 1 && surah !== 1 && surah !== 9) {
            if (!arabic.startsWith(basmala)) throw new Error(`${ref}: expected a Basmala prefix`);
            arabic = arabic.slice(basmala.length).trim();
        }
        ayat.push({
            ref,
            kind,
            surah,
            ayah: ar.numberInSurah,
            surahName: ar.surah.englishName,
            number: ar.number, // global ayah number, used for the audio URL
            ar: arabic,
            bn: clean(bn.text),
            en: clean(en.text),
        });
        console.log(`${kind.padEnd(12)} ${ref.padEnd(7)} ${ar.surah.englishName}`);
        await new Promise((r) => setTimeout(r, 150));
    }
}

await writeFile(
    new URL("../src/lib/islamic/ayat.json", import.meta.url),
    JSON.stringify({ source: `api.alquran.cloud ${EDITIONS}`, ayat }, null, 1) + "\n",
);
console.log(`${ayat.length} ayat written`);

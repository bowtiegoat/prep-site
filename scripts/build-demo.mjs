// Builds the public advisor demo at docs/demo/ (prep.thebowtiegoat.com/demo):
// the real site pages with the Firebase SDK swapped for a pretend database
// that lives in the visitor's browser (demo-src/mock/). Rerun after changing
// the site so the demo stays current:
//
//   node scripts/build-demo.mjs [exam-spreadsheet.xlsx]
//
// The demo never includes a real answer key: exams carry PI codes, indicators,
// and sources only, and demo-src/mock/seed.js makes up the answer letters.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import XLSX from 'xlsx';

const root = fileURLToPath(new URL('..', import.meta.url));
const docs = join(root, 'docs');
const out = join(docs, 'demo');
const examFile = process.argv[2] || join(homedir(), 'Downloads/Marketing Exam Tracker.xlsx');
const GOATCOUNTER = '<script data-goatcounter="https://bowtiegoat.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>';

// 1. The site's pages, minus the demo itself and the custom domain file.
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const entry of readdirSync(docs)) {
  if (['demo', 'CNAME'].includes(entry)) continue;
  cpSync(join(docs, entry), join(out, entry), { recursive: true });
}

// 2. Point the Firebase SDK at the pretend one (paths relative to each file).
const SDK = /https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/(firebase-[a-z]+)\.js/g;
function rewrite(dir, depth) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'mock') rewrite(path, depth + 1); continue; }
    if (!/\.(html|js)$/.test(entry.name)) continue;
    const text = readFileSync(path, 'utf8');
    const prefix = depth ? '../'.repeat(depth) : './';
    if (text.match(SDK)) writeFileSync(path, text.replace(SDK, `${prefix}mock/$1.js`));
  }
}
rewrite(out, 0);

// 3. The pretend database: shared pieces from the preview, demo pieces from demo-src.
mkdirSync(join(out, 'mock/data'), { recursive: true });
for (const f of ['firebase-app.js', 'firebase-firestore.js']) cpSync(join(root, 'preview/mock', f), join(out, 'mock', f));
for (const f of readdirSync(join(root, 'demo-src/mock'))) cpSync(join(root, 'demo-src/mock', f), join(out, 'mock', f));
const grading = readFileSync(join(root, 'functions/grading.js'), 'utf8').replace(/module\.exports = \{([^}]*)\};/, 'export {$1};');
writeFileSync(join(out, 'mock/grading.js'), grading);

// 4. Demo data: exam structure (no answers) and the PI card decks.
const { parseExamRows } = await import(pathToFileURL(join(docs, 'js/exam-import.js')));
const book = XLSX.readFile(examFile);
const { exams } = parseExamRows(XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' }), 'Marketing');
const data = {
  exams: exams.map(({ questions, ...meta }) => meta),
  questions: Object.fromEntries(exams.map((e) => [e.id, e.questions.map(({ q, code, indicator, source }) => ({ q, code, indicator, source }))])),
  decks: {},
};
const { DECKS, parseCardRows, parseDistrictRows } = await import(pathToFileURL(join(docs, 'js/flashcards.js')));
for (const [deckId, deck] of Object.entries(DECKS)) {
  const file = join(homedir(), `Desktop/All PIs Explained/Flashcards/${deck.name} Flashcards - Review.xlsx`);
  if (!existsSync(file)) continue;
  const cards = XLSX.readFile(file);
  data.decks[deckId] = {
    name: deck.name, events: deck.events,
    cards: parseCardRows(XLSX.utils.sheet_to_json(cards.Sheets.Cards, { defval: '' }), deckId).cards,
    districtAreas: parseDistrictRows(XLSX.utils.sheet_to_json(cards.Sheets['District decks'], { defval: '' }), deckId),
  };
}
// Safety check: no answer letters anywhere in the demo data.
if (JSON.stringify(data).includes('"answer"')) throw new Error('Demo data must not contain answers.');
writeFileSync(join(out, 'mock/data/demo-data.json'), JSON.stringify(data));

// 5. Demo pages: a welcome page instead of sign-in; sign-up and admin go to the dashboard.
cpSync(join(root, 'demo-src/index.html'), join(out, 'index.html'));
cpSync(join(root, 'demo-src/images'), join(out, 'images'), { recursive: true }); // the welcome page's headshot
const redirect = (to) => `<!DOCTYPE html><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=${to}"><a href="${to}">Continue</a>`;
writeFileSync(join(out, 'join.html'), redirect('index.html'));
writeFileSync(join(out, 'admin.html'), redirect('advisor.html'));

// 6. GoatCounter on every demo page (approved by the site owner).
for (const entry of readdirSync(out)) {
  if (!entry.endsWith('.html')) continue;
  const path = join(out, entry);
  const text = readFileSync(path, 'utf8');
  if (!text.includes('goatcounter') && text.includes('</body>')) writeFileSync(path, text.replace('</body>', `  ${GOATCOUNTER}\n</body>`));
}

console.log(`Demo built in docs/demo/ (${exams.length} Marketing exams, ${Object.values(data.decks).reduce((n, d) => n + d.cards.length, 0)} PI cards).`);

// Builds a clickable local copy of the student site in .preview/ using pretend
// data, so changes can be tried before they go live. Nothing here touches
// Firebase. The real site code is used as-is; only the Firebase SDK files are
// swapped for the stand-ins in preview/mock/.
//
//   node scripts/build-preview.mjs [exam-spreadsheet.xlsx] [zipgrade-export.xlsx]
//   cd .preview && python3 -m http.server 8126   → http://localhost:8126

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import XLSX from 'xlsx';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, '.preview');
const examFile = process.argv[2] || join(homedir(), 'Downloads/Marketing Exam Tracker.xlsx');
const zipGradeFile = process.argv[3] || join(homedir(), 'Downloads/quiz-Marketing 1322- D-standard20180510.xlsx');

rmSync(out, { recursive: true, force: true });
cpSync(join(root, 'docs'), out, { recursive: true });
cpSync(join(root, 'preview/mock'), join(out, 'mock'), { recursive: true });
mkdirSync(join(out, 'mock/data'), { recursive: true });

// Point every Firebase SDK import at the stand-ins.
const SDK = /https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/(firebase-[a-z]+)\.js/g;
function rewrite(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'mock') rewrite(path);
    else if (/\.(html|js)$/.test(entry.name)) {
      const text = readFileSync(path, 'utf8');
      if (SDK.test(text)) writeFileSync(path, text.replace(SDK, '/mock/$1.js'));
    }
  }
}
rewrite(out);

// The grading code the server uses, as an ES module for the browser.
const grading = readFileSync(join(root, 'functions/grading.js'), 'utf8')
  .replace(/module\.exports = \{([^}]*)\};/, 'export {$1};');
writeFileSync(join(out, 'mock/grading.js'), grading);

// Exams and answer keys from the spreadsheet (kept only in .preview/, which git ignores).
const { parseExamRows } = await import(pathToFileURL(join(root, 'docs/js/exam-import.js')));
const sheet = (file) => {
  const book = XLSX.readFile(file);
  return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
};
const { exams } = parseExamRows(sheet(examFile), 'Marketing');
writeFileSync(join(out, 'mock/data/exams.json'), JSON.stringify(exams.map(({ questions, ...meta }) => ({ ...meta, active: true }))));
writeFileSync(join(out, 'mock/data/keys.json'), JSON.stringify(Object.fromEntries(exams.map((e) => [e.id, e.questions]))));

// Made-up site-wide stats so rankings show. A couple of exams stay under the
// 10-test minimum. Test 1322 uses the real ZipGrade scores when available.
const { batchFromScores, applyBatch } = createRequire(import.meta.url)(join(root, 'functions/grading.js'));
let seedValue = 7;
const random = () => ((seedValue = (seedValue * 16807) % 2147483647) / 2147483647);
const normal = () => Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
const stats = {};
exams.forEach((exam, i) => {
  const takers = [3, 7].includes(i) ? 4 + i : 12 + Math.floor(random() * 30);
  const mean = 56 + random() * 10;
  const scores = Array.from({ length: takers }, () => Math.max(20, Math.min(98, Math.round(mean + normal() * 11))));
  stats[exam.id] = applyBatch(null, batchFromScores(scores, exam.questionCount), 1);
  // Made-up per-question results: how many of the takers got each question right.
  stats[exam.id].questionTakers = takers;
  stats[exam.id].questionCorrect = exam.questions.map(() => Math.round(takers * Math.max(0.15, Math.min(0.97, mean / 100 + normal() * 0.2))));
});
if (existsSync(zipGradeFile)) {
  const { parseZipGradeRows } = await import(pathToFileURL(join(root, 'docs/js/score-import.js')));
  const zip = parseZipGradeRows(sheet(zipGradeFile));
  // The real ZipGrade scores, including how many got each question right.
  stats['marketing-25-26-districts-1322'] = applyBatch(null, { ...batchFromScores(zip.scores, 100), perQuestionCorrect: zip.perQuestionCorrect }, 1);
}
writeFileSync(join(out, 'mock/data/stats.json'), JSON.stringify(stats));

console.log(`Preview built in .preview/ (${exams.length} exams). Serve it with:\n  cd .preview && python3 -m http.server 8126`);

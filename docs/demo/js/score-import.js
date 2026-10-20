// Reads a ZipGrade "standard" export: one row per student with Quiz Name,
// Num Questions, Num Correct, and Q1..Qn marked 1 (right) or 0 (wrong).
// Names are ignored; only scores and per-question counts are kept.
// Pure (no Firebase) so it can be tested outside the browser.

export function parseZipGradeRows(rows) {
  const errors = [];
  const warnings = [];
  if (!rows.length) return { errors: ['The spreadsheet is empty.'], warnings, scores: [] };
  if (!('Num Correct' in rows[0]) || !('Q1' in rows[0])) {
    return { errors: ["This doesn't look like a ZipGrade export (no \"Num Correct\" or \"Q1\" columns)."], warnings, scores: [] };
  }

  const quizNames = [...new Set(rows.map((r) => String(r['Quiz Name'] ?? '').trim()).filter(Boolean))];
  if (quizNames.length > 1) errors.push(`The file mixes different quizzes: ${quizNames.join(', ')}. Export one exam per file.`);
  const quizName = quizNames[0] || '';
  const testNumber = (quizName.match(/\b(\d{3,5})\b/) || [])[1] || '';

  const questionCount = Math.max(...rows.map((r) => Number(r['Num Questions']) || 0));
  const perQuestionCorrect = Array(questionCount).fill(0);
  const scores = [];
  let skipped = 0;

  rows.forEach((row, i) => {
    const line = i + 2;
    const marks = [];
    for (let q = 1; q <= questionCount; q += 1) marks.push(row[`Q${q}`]);
    const blank = marks.every((m) => m === '' || m == null);
    if (blank) { skipped += 1; return; }
    const numbers = marks.map((m) => Number(m));
    if (numbers.some((m) => m !== 0 && m !== 1)) {
      errors.push(`Row ${line}: question marks should be 1 or 0.`);
      return;
    }
    const correct = numbers.reduce((a, b) => a + b, 0);
    if (Number(row['Num Correct']) !== correct) {
      errors.push(`Row ${line}: Num Correct (${row['Num Correct']}) doesn't match the question marks (${correct}).`);
      return;
    }
    numbers.forEach((m, q) => { perQuestionCorrect[q] += m; });
    scores.push(correct);
  });
  if (skipped) warnings.push(`${skipped} blank row${skipped === 1 ? '' : 's'} skipped.`);
  if (!scores.length && !errors.length) errors.push('No scores found.');

  const average = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
  return { quizName, testNumber, questionCount, scores, perQuestionCorrect, average, errors, warnings };
}

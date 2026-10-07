// Turns exam-tracker spreadsheet rows into exams + answer keys, and lists any
// problems. Pure (no Firebase) so it can be tested outside the browser.
//
// Expected columns: Level, Year, Test #, Q#, Answer, Code, Source
// Code looks like "BL:003 Explain types of business ownership"; some rows
// only have "BL:003", in which case the description is borrowed from another
// row with the same code. Personal Financial Literacy exams use a national
// standard instead, like "Managing Credit Grade 12"; it becomes the code as-is.

const LEVELS = ['Districts', 'States', 'ICDC'];
const CODE_PATTERN = /^([A-Z]{2,3}:\d{3})\s*(.*)$/;
export const PFL_STANDARD = /^(Earning Income|Spending|Saving|Investing|Managing Credit|Managing Risk) Grade (8|12)$/;

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function text(value) {
  if (value == null) return '';
  return String(value).trim();
}

// Spreadsheet numbers like 1226 come through as 1226 (or 1226.0).
function testNumberText(value) {
  return typeof value === 'number' ? String(Math.round(value)) : text(value);
}

export function parseExamRows(rows, cluster) {
  const errors = [];
  const warnings = [];
  const groups = new Map();
  const indicatorByCode = new Map();

  rows.forEach((row, i) => {
    const line = i + 2; // header is row 1
    const level = text(row['Level']);
    const year = text(row['Year']);
    const test = testNumberText(row['Test #']);
    if (!level && !year && !test && !row['Q#']) return; // blank row
    const q = Number(row['Q#']);
    const answer = text(row['Answer']).toUpperCase();
    const pfl = text(row['Code']).match(PFL_STANDARD);
    const codeMatch = pfl ? [pfl[0], pfl[0], ''] : text(row['Code']).match(CODE_PATTERN);

    if (!LEVELS.includes(level)) errors.push(`Row ${line}: Level "${level}" should be Districts, States, or ICDC.`);
    if (!/^\d{2}-\d{2}$/.test(year)) errors.push(`Row ${line}: Year "${year}" should look like 24-25.`);
    if (!test) errors.push(`Row ${line}: Test # is missing.`);
    if (!Number.isInteger(q) || q < 1) errors.push(`Row ${line}: Q# "${row['Q#']}" isn't a question number.`);
    if (!['A', 'B', 'C', 'D'].includes(answer)) errors.push(`Row ${line}: Answer "${row['Answer']}" should be A, B, C, or D.`);
    if (!codeMatch) errors.push(`Row ${line}: Code "${text(row['Code'])}" should start with something like BL:003 (or be a PFL standard like Saving Grade 8).`);

    const code = codeMatch ? codeMatch[1] : '';
    const indicator = codeMatch ? codeMatch[2].trim() : '';
    if (code && indicator && !indicatorByCode.has(code)) indicatorByCode.set(code, indicator);

    const key = `${year}|${level}|${test}`;
    if (!groups.has(key)) groups.set(key, { year, level, test, questions: [] });
    groups.get(key).questions.push({ q, answer, code, indicator, source: text(row['Source']), line });
  });

  const exams = [];
  for (const group of groups.values()) {
    const label = `${group.year.replace(/^(\d{2})-(\d{2})$/, '20$1-$2')} ${group.level}`;
    const questions = group.questions.sort((a, b) => a.q - b.q);
    questions.forEach((question, i) => {
      if (question.q !== i + 1) errors.push(`${label} (Test ${group.test}): question numbers skip or repeat near Q${question.q}.`);
    });
    const missingIndicator = [];
    for (const question of questions) {
      if (!question.indicator && question.code && !PFL_STANDARD.test(question.code)) {
        question.indicator = indicatorByCode.get(question.code) || '';
        if (!question.indicator) missingIndicator.push(`Q${question.q} (${question.code})`);
      }
    }
    if (missingIndicator.length) {
      warnings.push(`${label} (Test ${group.test}): no description found for ${missingIndicator.join(', ')}.`);
    }
    exams.push({
      id: slug(`${cluster}-${group.year}-${group.level}-${group.test}`),
      cluster,
      year: group.year,
      level: group.level,
      testNumber: group.test,
      label,
      subtitle: /^\d+$/.test(group.test) ? `Test ${group.test}` : group.test,
      questionCount: questions.length,
      questions: questions.map(({ q, answer, code, indicator, source }) => ({ q, answer, code, indicator, source })),
    });
  }
  return { exams, errors: [...new Set(errors)], warnings };
}

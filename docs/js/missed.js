// Missed-question rows shared by the results pages and the admin export:
// a sortable table and a spreadsheet download.

import { esc, linkify, formatDate } from './app.js';

// DECA instructional areas, from the letters before the colon in a PI code.
export const INSTRUCTIONAL_AREAS = {
  BL: 'Business Law',
  CM: 'Channel Management',
  CO: 'Communication Skills',
  CR: 'Customer Relations',
  EC: 'Economics',
  EI: 'Emotional Intelligence',
  EN: 'Entrepreneurship',
  FI: 'Financial Analysis',
  HR: 'Human Resources Management',
  IM: 'Marketing-Information Management',
  MK: 'Marketing',
  MP: 'Market Planning',
  NF: 'Information Management',
  OP: 'Operations',
  PD: 'Professional Development',
  PI: 'Pricing',
  PM: 'Product/Service Management',
  PR: 'Promotion',
  SE: 'Selling',
  SM: 'Strategic Management',
};

export function areaOf(code) {
  const prefix = String(code || '').split(':')[0];
  return INSTRUCTIONAL_AREAS[prefix] || prefix;
}

// One row per missed question across the given attempts.
export function missedRows(attempts) {
  return attempts.flatMap((a) => a.missed.map((m) => ({
    date: a.submittedAt?.toDate ? a.submittedAt.toDate() : null,
    cluster: a.cluster,
    exam: a.examLabel,
    test: a.examSubtitle || '',
    event: a.eventCode || '',
    q: m.q,
    yourAnswer: m.yourAnswer || '',
    correctAnswer: m.correctAnswer,
    code: m.code,
    area: areaOf(m.code),
    indicator: m.indicator,
    source: m.source,
  })));
}

const COLUMNS = {
  date: { label: 'Date', value: (r) => r.date?.getTime() || 0, html: (r) => `<span class="whitespace-nowrap">${esc(formatDate(r.date))}</span>` },
  exam: { label: 'Exam', value: (r) => `${r.exam} ${r.test}`, html: (r) => `<span class="whitespace-nowrap">${esc(r.exam)}</span><br /><span class="text-xs text-ink-500">${esc(r.test)}</span>` },
  q: { label: 'Q#', value: (r) => r.q, html: (r) => `<span class="font-semibold tabular-nums">${r.q}</span>` },
  yourAnswer: { label: 'Yours', value: (r) => r.yourAnswer || '~', html: (r) => (r.yourAnswer ? `<span class="font-semibold text-rose-600">${esc(r.yourAnswer)}</span>` : '<span class="text-ink-400">blank</span>') },
  correctAnswer: { label: 'Correct', value: (r) => r.correctAnswer, html: (r) => `<span class="font-semibold text-green-700">${esc(r.correctAnswer)}</span>` },
  area: { label: 'Instructional area', value: (r) => r.area, html: (r) => esc(r.area) },
  code: { label: 'Performance indicator', value: (r) => r.code, html: (r) => `<span class="font-mono text-xs bg-ink-100 rounded px-1.5 py-0.5 whitespace-nowrap">${esc(r.code)}</span> ${esc(r.indicator)}` },
  source: { label: 'Source', value: (r) => r.source, html: (r) => `<span class="text-xs text-ink-600">${linkify(r.source)}</span>` },
};

// Renders a table whose column headers sort it. Click again to reverse.
export function renderSortableTable(container, rows, { columns, sortBy, minWidth = 720 }) {
  let key = sortBy;
  let dir = 1;

  function draw() {
    const column = COLUMNS[key];
    const sorted = [...rows].sort((a, b) => {
      const x = column.value(a);
      const y = column.value(b);
      const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
      return order * dir || (b.date?.getTime() || 0) - (a.date?.getTime() || 0) || a.q - b.q;
    });
    container.innerHTML = `
      <div class="overflow-x-auto rounded-xl bg-white border border-ink-200 px-4">
        <table class="w-full text-sm" style="min-width:${minWidth}px">
          <thead><tr class="text-left text-xs uppercase tracking-wider text-ink-500">
            ${columns.map((k) => `
              <th class="py-3 pr-3">
                <button type="button" data-sort="${k}" class="inline-flex items-center gap-1 uppercase tracking-wider hover:text-ink-900 ${k === key ? 'text-ink-900' : ''}">
                  ${COLUMNS[k].label}<span aria-hidden="true">${k === key ? (dir === 1 ? '▲' : '▼') : '↕'}</span>
                </button>
              </th>`).join('')}
          </tr></thead>
          <tbody>
            ${sorted.map((r) => `<tr class="border-t border-ink-100 align-top">${columns.map((k) => `<td class="py-3 pr-3">${COLUMNS[k].html(r)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  container.addEventListener('click', (e) => {
    const button = e.target.closest('[data-sort]');
    if (!button) return;
    if (button.dataset.sort === key) dir = -dir;
    else { key = button.dataset.sort; dir = 1; }
    draw();
  });
  draw();
}

// ---------- Spreadsheet download ----------

// YYYY-MM-DD in the viewer's time zone (toISOString would use UTC).
function localDay(date) {
  return date.toLocaleDateString('en-CA');
}

function loadSheetJS() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error("Couldn't load the spreadsheet tool. Check your connection and try again."));
    document.head.appendChild(script);
  });
}

// Downloads an .xlsx with two tabs: one row per missed question, one row per exam.
export async function downloadResults({ studentName, attempts, fileName }) {
  const XLSX = await loadSheetJS();
  const sorted = [...attempts].sort((a, b) => (a.submittedAt?.toMillis() || 0) - (b.submittedAt?.toMillis() || 0));
  const day = (ts) => (ts?.toDate ? localDay(ts.toDate()) : '');

  const examRows = sorted.map((a) => ({
    'Student': studentName,
    'Date taken': day(a.submittedAt),
    'Cluster': a.cluster,
    'Exam': a.examLabel,
    'Test': a.examSubtitle || '',
    'Event': a.eventCode || '',
    'Correct': a.correct,
    'Total': a.total,
    'Percent': Math.round((a.correct / a.total) * 100),
    'Test-takers when taken': a.statsAtSubmit?.takers ?? '',
    'Average when taken': a.statsAtSubmit?.averageCorrect ?? '',
    'Percentile when taken': (a.statsAtSubmit?.takers || 0) >= 10 ? a.statsAtSubmit.percentile : '',
  }));

  const missed = missedRows(sorted).map((r) => ({
    'Student': studentName,
    'Date taken': r.date ? localDay(r.date) : '',
    'Cluster': r.cluster,
    'Exam': r.exam,
    'Test': r.test,
    'Q#': r.q,
    'Your answer': r.yourAnswer || '(blank)',
    'Correct answer': r.correctAnswer,
    'Instructional area': r.area,
    'PI code': r.code,
    'Performance indicator': r.indicator,
    'Source': r.source,
  }));

  const book = XLSX.utils.book_new();
  const sheet = (rows, widths) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = widths.map((wch) => ({ wch }));
    return ws;
  };
  XLSX.utils.book_append_sheet(book, sheet(missed, [20, 11, 12, 16, 14, 5, 11, 13, 26, 9, 60, 60]), 'Missed questions');
  XLSX.utils.book_append_sheet(book, sheet(examRows, [20, 11, 12, 16, 14, 8, 8, 6, 8, 12, 12, 12]), 'Exams');
  XLSX.writeFile(book, fileName);
}

export function exportFileName(name) {
  const safe = String(name).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'student';
  return `BowtieGOAT-Exam-Results-${safe}-${localDay(new Date())}.xlsx`;
}

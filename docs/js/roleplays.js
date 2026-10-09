// Role play practice logs: rubrics, GOAT role play data, and the shared
// pieces the Event Hub and Advisor Dashboard both draw.
//
// A log is one practice run. Students record a level (Novice to Exemplary)
// for each rubric row; the point ranges are shown only as a guide.

import { esc, linkify } from './app.js';
import { EVENTS } from './events.js';

export const LEVELS = [
  { key: 'N', name: 'Novice' },
  { key: 'D', name: 'Developing' },
  { key: 'P', name: 'Proficient' },
  { key: 'E', name: 'Exemplary' },
];
export const levelName = (key) => LEVELS.find((l) => l.key === key)?.name || '';
const LEVEL_VALUE = { N: 1, D: 2, P: 3, E: 4 };

// Point ranges for Novice / Developing / Proficient / Exemplary. Series and
// team PIs follow DECA's 2026 sample judge's evaluation forms (BSM ICDC and
// MTDM Association); Principles and PFL come from the GOAT role play judge pages.
const SOLUTION = ['0–2', '3–5', '6–7', '8'];
const CAREER = ['0–1', '2–3', '4–5', '6'];
const RUBRIC_SHAPES = {
  series: { name: 'Series events', pis: 5, pi: ['0–3', '4–6', '7–9', '10'], overall: ['0–2', '3–5', '6–7', '8'] },
  team: { name: 'Team Decision Making events', pis: 5, pi: ['0–3', '4–6', '7–9', '10'], overall: ['0–2', '3–5', '6–7', '8'] },
  principles: { name: 'Principles events', pis: 4, pi: ['0–3', '4–7', '8–11', '12'], overall: ['0–3', '4–6', '7–9', '10'] },
  pfl: { name: 'Personal Financial Literacy', pis: 3, pi: ['0–5', '6–11', '12–16', '17'], overall: ['0–2', '3–4', '5–6', '7'] },
};

export function rubricTypeFor(eventCode) {
  const event = EVENTS.find((e) => e.code === eventCode);
  if (eventCode === 'PFL') return 'pfl';
  if (event?.cluster === 'Business Administration Core') return 'principles';
  if (event?.type === 'Role Play' && event.competitors === '2') return 'team';
  return 'series';
}

// The rows of a rubric, in judge-sheet order.
export function rubricRows(type) {
  const shape = RUBRIC_SHAPES[type] || RUBRIC_SHAPES.series;
  const rows = [];
  for (let i = 1; i <= shape.pis; i += 1) {
    rows.push({ key: `pi${i}`, group: 'Performance indicators', label: `PI #${i}`, ranges: shape.pi, pi: i - 1 });
  }
  rows.push(
    { key: 'unique', group: 'Solution', label: 'Unique', ranges: SOLUTION },
    { key: 'practical', group: 'Solution', label: 'Practical', ranges: SOLUTION },
    { key: 'effective', group: 'Solution', label: 'Effective', ranges: SOLUTION },
    { key: 'critical', group: 'Career competencies', label: 'Critical thinking', ranges: CAREER },
    { key: 'communication', group: 'Career competencies', label: 'Communication', ranges: CAREER },
    { key: 'decision', group: 'Career competencies', label: 'Decision-making', ranges: CAREER },
    { key: 'overall', group: 'Overall impression', label: 'Overall impression', ranges: shape.overall },
  );
  return rows;
}

// Instructional areas, for DECA role plays (GOAT role plays fill this in).
// "Information Management" and "Marketing-Information Management" are different areas.
export const INSTRUCTIONAL_AREAS = {
  'Business administration': [
    'Business Law', 'Channel Management', 'Communication Skills', 'Customer Relations', 'Economics',
    'Emotional Intelligence', 'Entrepreneurship', 'Financial Analysis', 'Financial-Information Management',
    'Human Resources Management', 'Information Management', 'Knowledge Management', 'Market Planning',
    'Marketing', 'Marketing-Information Management', 'Operations', 'Pricing', 'Product/Service Management',
    'Professional Development', 'Promotion', 'Quality Management', 'Risk Management', 'Selling',
    'Strategic Management',
  ],
  'Personal Financial Literacy': ['Earning Income', 'Spending', 'Saving', 'Investing', 'Managing Credit', 'Managing Risk'],
};

export const JUDGES = ['Classmate / DECA member', 'Teacher or advisor', 'Parent or family member', 'Alum or business professional', 'Other'];

export const GOAT_PAGE = 'https://www.thebowtiegoat.com/role-plays.html';
export const DECA_PAGE = 'https://www.deca.org/resources';
const GOAT_SITE = 'https://www.thebowtiegoat.com/';

// The GOAT role play list lives on thebowtiegoat.com, so new uploads show up here automatically.
let goatPromise = null;
export function loadGoatRolePlays() {
  goatPromise ||= fetch(`${GOAT_SITE}js/roleplays.json`)
    .then((r) => (r.ok ? r.json() : []))
    .then((list) => list.map((rp) => ({ ...rp, title: goatTitle(rp), url: `${GOAT_SITE}roleplays/${rp.file}` })))
    .catch(() => []);
  return goatPromise;
}

// GOAT_AAM_2526_DISTRICT_EVENT2.pdf -> "AAM 2025-26 District Event 2"
export function goatTitle(rp) {
  const parts = rp.file.replace(/\.pdf$/i, '').split('_').slice(1);
  const [code, years, ...rest] = parts;
  const year = /^\d{4}$/.test(years) ? `20${years.slice(0, 2)}-${years.slice(2)}` : years;
  const kind = rest.join(' ')
    .replace(/([A-Z]+)(\d+)/g, '$1 $2')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return [code, year, kind].filter(Boolean).join(' ');
}

// A name for a DECA role play from its PDF link:
// .../67c1d9b4..._DECA_BLTDM_2025_District_Event.pdf -> "DECA BLTDM 2025 District Event"
export function decaTitle(url) {
  let name = '';
  try {
    const file = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
    if (/\.pdf$/i.test(file)) name = file.replace(/\.pdf$/i, '')
      .replace(/^[0-9a-f]{16,}_/i, '')
      .replace(/[_+-]+/g, ' ')
      .trim();
  } catch {}
  if (!name || name.length > 80) return 'DECA role play';
  return /^deca\b/i.test(name) ? name : `DECA ${name}`;
}

// Newest practice date first.
export const sortLogs = (logs) => [...logs].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

export function shortDate(ymd) {
  return new Date(`${ymd}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Where the student stands on their most recent run.
export function latestSummary(logs) {
  const last = sortLogs(logs)[0];
  if (!last) return '';
  const counts = {};
  Object.values(last.levels || {}).forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
  const top = LEVELS.filter((l) => counts[l.key]).sort((a, b) => counts[b.key] - counts[a.key])[0];
  return top ? `mostly ${top.name} on the latest run` : '';
}

// Average level of a run, 1 (Novice) to 4 (Exemplary).
function runAverage(log) {
  const values = Object.values(log.levels || {}).map((v) => LEVEL_VALUE[v]).filter(Boolean);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

// "Trending up" / "Holding steady" / "Trending down", comparing the first and latest runs.
export function trend(logs) {
  const runs = sortLogs(logs).reverse().map(runAverage).filter((v) => v != null);
  if (runs.length < 2) return '';
  const change = runs[runs.length - 1] - runs[0];
  return change >= 0.25 ? 'Trending up' : change <= -0.25 ? 'Trending down' : 'Holding steady';
}

// The tracking grid: one row per rubric row, one column per run (oldest to newest).
export function gridHtml(logs, type) {
  const runs = sortLogs(logs).reverse();
  if (!runs.length) return '';
  const rows = rubricRows(type);
  let group = '';
  const body = rows.map((row) => {
    const head = row.group !== group
      ? `<tr><td colspan="${runs.length + 2}" class="pt-3 pb-0.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">${esc((group = row.group))}</td></tr>`
      : '';
    const latest = runs[runs.length - 1].levels?.[row.key];
    return `${head}<tr>
      <td class="pr-3 text-ink-700 whitespace-nowrap">${esc(row.label)}</td>
      ${runs.map((log) => {
        const v = log.levels?.[row.key];
        const pi = row.pi != null && log.pis?.[row.pi] ? ` · ${log.pis[row.pi]}` : '';
        const tip = `${shortDate(log.date)} · ${log.title}\n${row.label}: ${v ? levelName(v) : 'Not rated'}${pi}`;
        return `<td><span title="${esc(tip)}" class="${v ? `lv-${v}` : 'border border-dashed border-ink-300 text-ink-300'} w-9 h-8 rounded grid place-items-center font-bold text-xs">${v || '–'}</span></td>`;
      }).join('')}
      <td class="pl-3 text-ink-700 whitespace-nowrap">${latest ? esc(levelName(latest)) : '<span class="text-ink-400">Not rated</span>'}</td>
    </tr>`;
  }).join('');
  return `
    <div class="overflow-x-auto">
      <table class="text-sm border-separate" style="border-spacing:2px">
        <thead><tr><th></th>${runs.map((l) => `<th class="px-1 pb-1 text-xs font-semibold text-ink-500 whitespace-nowrap">${esc(shortDate(l.date))}</th>`).join('')}<th class="pl-3 pb-1 text-xs font-semibold text-ink-500 text-left">Latest</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <div class="mt-3 flex flex-wrap gap-3 text-xs text-ink-600">
      ${LEVELS.map((l) => `<span class="inline-flex items-center gap-1.5"><span class="lv-${l.key} w-5 h-5 rounded grid place-items-center font-bold">${l.key}</span>${l.name}</span>`).join('')}
      <span class="inline-flex items-center gap-1.5"><span class="w-5 h-5 rounded border border-dashed border-ink-300"></span>Not rated</span>
    </div>`;
}

// The list of runs, newest first. actions(log) returns extra buttons (Edit/Delete) or ''.
export function logListHtml(logs, { actions = () => '', viewerUid = null } = {}) {
  return `<ul class="divide-y divide-ink-100">${sortLogs(logs).map((log) => {
    const details = [
      shortDate(log.date),
      log.ia,
      log.judge ? `Judged by: ${log.judge}` : '',
      log.memberUids?.length > 1 && log.createdBy !== viewerUid ? `Logged by ${log.createdByName}` : '',
    ].filter(Boolean).map(esc).join(' · ');
    const links = [
      log.score != null ? `${log.score}/100` : '',
      log.url ? `<a href="${esc(log.url)}" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline">Role play</a>` : '',
      log.videoUrl ? `<a href="${esc(log.videoUrl)}" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline">Video</a>` : '',
      actions(log),
    ].filter(Boolean).join(' · ');
    return `
      <li class="py-3 text-sm">
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p><strong>${esc(log.title)}</strong> <span class="text-ink-500">· ${details}</span></p>
          <p class="text-ink-600">${links}</p>
        </div>
        ${log.feedback ? `<p class="mt-1 text-ink-700 whitespace-pre-line">${linkify(log.feedback)}</p>` : ''}
        ${log.fixNext ? `<p class="mt-1 text-sm"><span class="font-semibold">Fix next time:</span> ${esc(log.fixNext)}${log.timed ? ' <span class="ml-1 rounded-full bg-ink-100 text-ink-600 text-[11px] font-semibold px-2 py-0.5">Full timing</span>' : ''}</p>` : (log.timed ? '<p class="mt-1"><span class="rounded-full bg-ink-100 text-ink-600 text-[11px] font-semibold px-2 py-0.5">Full timing</span></p>' : '')}
      </li>`;
  }).join('')}</ul>`;
}

// Spreadsheet rows, one per run, for the advisor's Export.
export function exportRows(logs, studentName) {
  return sortLogs(logs).reverse().map((log) => {
    const row = {
      'Student': studentName,
      'Date': log.date,
      'Event': log.eventCode,
      'Source': log.source === 'goat' ? 'GOAT' : 'DECA',
      'Role play': log.title,
      'Link': log.url || '',
      'Instructional area': log.ia || '',
      'Judged by': log.judge || '',
      'Overall score': log.score ?? '',
    };
    // Same columns for every rubric; Principles and PFL leave the extra PI columns blank.
    rubricRows('series').forEach((r) => {
      row[r.label] = levelName(log.levels?.[r.key]);
    });
    row['Feedback'] = log.feedback || '';
    row['Fix next time'] = log.fixNext || '';
    row['Full timing'] = log.timed ? 'Yes' : '';
    row['Video'] = log.videoUrl || '';
    return row;
  });
}

// The "Your Prep Plan" card on the Event Hub for role play events: this
// week's tasks, anything overdue, and what's coming up. The rules live in
// prep-plan.js.

import { collection, doc, getDocs, query, updateDoc, where } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db, esc, isViewingAs } from './app.js';
import { advisorItems, planStatus, shortDate } from './prep-plan.js';

const PLAN_NAME = { district: 'Districts', state: 'States' };

// An advisor's info-only item on a student's plan.
function noteRow(n, { showWeek = false } = {}) {
  return `
    <li class="flex items-start gap-3 py-2.5">
      <span class="mt-0.5 w-4 h-4 shrink-0 rounded-full bg-blue-100 border border-blue-300" aria-hidden="true"></span>
      <span class="flex-1 min-w-0 text-sm">
        <span class="text-ink-900">${esc(n.text)}</span>
        <span class="block text-xs text-blue-700">From your advisor${n.date ? ` · ${esc(shortDate(n.date))}` : n.weekStart && !showWeek ? ` · Week of ${esc(shortDate(n.weekStart))}` : ''}</span>
      </span>
      ${showWeek ? `<span class="shrink-0 text-xs text-ink-500">Week ${n.week}</span>` : ''}
    </li>`;
}

// Prepared (and other) events don't have a plan yet, but advisors can still
// send them items, shown under the placeholder.
export function showAdvisorNotes({ settings }) {
  const items = (settings?.items || []).filter((it) => it.group === 'everyone' || it.group === 'prepared');
  if (!items.length) return;
  // These students have no plan weeks yet, so show each item's date (or its week's Monday), soonest first.
  const notes = items.map((it) => ({ ...it, sortKey: it.date || it.weekStart || '' })).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const box = document.querySelector('[data-plan-notes]');
  if (!box || !notes.length) return;
  box.innerHTML = `<p class="mt-4 text-xs font-semibold uppercase tracking-[0.15em] text-blue-700">From your advisor</p>
    <ul class="divide-y divide-ink-100">${notes.map((n) => noteRow(n)).join('')}</ul>`;
  box.classList.remove('hidden');
}

export async function initPrepPlan({ user, profile, first, links, attemptFilters, settings = {} }) {
  const card = document.querySelector('[data-plan-card]');
  const $ = (sel) => card.querySelector(sel);
  const body = $('[data-plan-body]');
  $('[data-plan-placeholder]').classList.add('hidden');
  $('[data-plan-soon]').classList.add('hidden');
  body.classList.remove('hidden');

  if (!first?.date) {
    body.innerHTML = `<p class="mt-4 text-sm text-ink-600">Your advisor hasn't set your ${first?.label || 'District'} date yet. Your 8-week plan will appear here once they do.</p>`;
    return;
  }

  const logQuery = () => getDocs(query(collection(db, 'roleplayLogs'), where('schoolId', '==', profile.schoolId), where('memberUids', 'array-contains', user.uid)))
    .then((snap) => snap.docs.map((d) => d.data()).filter((l) => l.eventCode === profile.eventCode));
  const [examSnap, attemptSnap, firstLogs] = await Promise.all([
    getDocs(query(collection(db, 'exams'), where('cluster', '==', profile.cluster))),
    getDocs(query(collection(db, 'attempts'), ...attemptFilters())),
    logQuery(),
  ]);
  const exams = examSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => e.active !== false);
  const attempts = attemptSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.track === profile.track);
  let logs = firstLogs;
  let checks = { ...(profile.planChecks || {}) };
  const viewOnly = isViewingAs();
  const open = new Set(); // collapsed sections the student opened

  function render() {
    const plan = planStatus({
      eventCode: profile.eventCode, cluster: profile.cluster, exams, competitionDate: first.date, attempts, logs, checks,
      removed: settings.removed || [], excused: profile.planExcused || {},
    });
    const notes = advisorItems(settings.items, plan.weeks, { rolePlay: true });
    const pct = plan.totalCount ? Math.round((plan.doneCount / plan.totalCount) * 100) : 0;
    $('[data-plan-count]').textContent = `${plan.doneCount} of ${plan.totalCount} done`;
    $('[data-plan-bar]').style.width = `${pct}%`;

    const linkFor = (t) => (t.link === 'guidelines' && links.guidelines
      ? `<a href="${esc(links.guidelines)}" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline">Open guidelines</a>`
      : t.link === 'results' ? '<a href="results.html" class="text-blue-600 underline">My Results</a> · <a href="insights.html" class="text-blue-600 underline">Exam Deep Dive</a>'
        : t.kind === 'exam' && t.state !== 'done' ? `<a href="exam.html?id=${encodeURIComponent(t.examId)}" class="text-blue-600 underline">Go to exam</a>` : '');
    const BADGE = {
      overdue: '<span class="rounded-full bg-rose-100 text-rose-700 text-[11px] font-semibold px-2 py-0.5">Overdue</span>',
      soon: '<span class="rounded-full bg-tan-100 text-tan-700 text-[11px] font-semibold px-2 py-0.5">Coming soon</span>',
    };
    const row = (t, { showWeek = false } = {}) => {
      const manual = t.kind === 'check';
      const extra = [t.note, linkFor(t), !manual && t.kind !== 'cards' && t.state !== 'done' ? 'Checks off automatically' : ''].filter(Boolean).join(' · ');
      return `
        <li class="flex items-start gap-3 py-2.5 ${t.state === 'done' ? 'text-ink-400' : ''}">
          <input type="checkbox" ${t.state === 'done' ? 'checked' : ''} ${manual && !viewOnly ? `data-plan-check="${esc(t.id)}"` : 'disabled'}
            class="mt-0.5 w-4 h-4 shrink-0 ${manual && !viewOnly ? 'cursor-pointer' : ''}" aria-label="${esc(t.label)}" />
          <span class="flex-1 min-w-0 text-sm">
            <span class="${t.state === 'done' ? 'line-through' : 'text-ink-900'}">${esc(t.label)}</span>
            ${extra ? `<span class="block text-xs text-ink-500">${extra}</span>` : ''}
          </span>
          <span class="shrink-0 flex items-center gap-2 text-xs text-ink-500">${BADGE[t.state] || ''}${showWeek ? `Week ${t.week}` : ''}</span>
        </li>`;
    };
    const list = (tasks, opts, extraNotes = []) => `<ul class="divide-y divide-ink-100">${tasks.map((t) => row(t, opts)).join('')}${extraNotes.map((n) => noteRow(n, opts)).join('')}</ul>`;
    const section = (key, title, tasks, opts, startOpen, extraNotes = []) => (tasks.length + extraNotes.length ? `
      <details data-section="${key}" class="mt-4" ${open.has(key) || startOpen ? 'open' : ''}>
        <summary class="cursor-pointer text-xs font-semibold uppercase tracking-[0.15em] text-ink-500">${title}</summary>
        ${list(tasks, opts, extraNotes)}
      </details>` : '');

    const status = plan.overdue.length
      ? `<span class="font-semibold text-rose-700">${plan.overdue.length} task${plan.overdue.length === 1 ? '' : 's'} overdue</span>`
      : '<span class="font-semibold text-green-700">You\'re on track</span>';
    const intro = `<p class="mt-4 text-sm text-ink-600">An 8-week plan to get you ready for ${PLAN_NAME[first.level] || first.label}. Each week runs Monday to Sunday; finish that week's list by Sunday. Exams and role plays check off by themselves.</p>`;

    if (!plan.started) {
      const w1 = plan.weeks[0];
      body.innerHTML = `${intro}
        <p class="mt-3 text-sm"><strong>Your plan starts Monday, ${esc(shortDate(w1.start))}.</strong> Here's week 1:</p>
        ${list(plan.tasks.filter((t) => t.week === 1), {}, notes.filter((n) => n.week === 1))}`;
      return;
    }
    const week = plan.weeks.find((w) => w.number === plan.currentWeek);
    const overdue = plan.overdue;
    const thisWeek = plan.tasks.filter((t) => t.week === plan.currentWeek && t.state !== 'overdue');
    const later = plan.tasks.filter((t) => t.week > plan.currentWeek);
    const earlierDone = plan.tasks.filter((t) => t.week < plan.currentWeek && t.state === 'done');
    body.innerHTML = `${intro}
      <p class="mt-2 text-sm">${week ? `<strong>Week ${week.number} of 8</strong> · ${esc(shortDate(week.start))}–${esc(shortDate(week.end))} · ` : '<strong>Your 8 weeks are done.</strong> Use the days before your competition for your own review. · '}${status}</p>
      ${overdue.length ? `<div class="mt-4 rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-1">
        <p class="pt-2 text-xs font-semibold uppercase tracking-[0.15em] text-rose-700">Catch up</p>${list(overdue, { showWeek: true })}</div>` : ''}
      ${week ? `<p class="mt-5 text-xs font-semibold uppercase tracking-[0.15em] text-ink-500">This week</p>${list(thisWeek, {}, notes.filter((n) => n.week === plan.currentWeek))}` : ''}
      ${section('later', `Coming up (${later.length + notes.filter((n) => n.week > plan.currentWeek).length})`, later, { showWeek: true }, false, notes.filter((n) => n.week > plan.currentWeek))}
      ${section('done', `Done earlier (${earlierDone.length})`, earlierDone, { showWeek: true }, false)}`;
  }

  body.addEventListener('toggle', (e) => {
    const key = e.target.dataset?.section;
    if (!key) return;
    if (e.target.open) open.add(key); else open.delete(key);
  }, true);
  body.addEventListener('change', async (e) => {
    const box = e.target.closest('[data-plan-check]');
    if (!box) return;
    const id = box.dataset.planCheck;
    const before = checks;
    checks = { ...checks };
    if (box.checked) checks[id] = true; else delete checks[id];
    render();
    try {
      await updateDoc(doc(db, 'users', user.uid), { planChecks: checks });
    } catch {
      checks = before;
      render();
      alert("Couldn't save that. Please try again.");
    }
  });
  // A role play saved or deleted in the drawer below can check off a task.
  document.addEventListener('prep:logs-changed', async () => {
    try { logs = await logQuery(); render(); } catch {}
  });
  render();
}

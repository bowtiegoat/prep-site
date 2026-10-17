// The "Your Prep Plan" card on the Event Hub: this week's tasks, anything
// overdue, and what's coming up. The rules live in prep-plan.js.
//
// Teams share one plan: tasks the team shares (and the links they submit)
// are saved on the team, so a check-off by one teammate counts for everyone.
// Exams and studying stay each student's own.

import {
  arrayUnion, collection, deleteField, doc, getDocs, query, updateDoc, where,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db, esc, isViewingAs } from './app.js';
import { takesExam } from './events.js';
import {
  PLANS, advisorItems, planStatus, planType, sharedTaskIds, shortDate,
} from './prep-plan.js';

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

// Events without a plan (virtual events) still see advisor items meant for
// everyone, shown under the placeholder.
export function showAdvisorNotes({ settings }) {
  const items = (settings?.items || []).filter((it) => it.group === 'everyone');
  if (!items.length) return;
  // These students have no plan weeks yet, so show each item's date (or its week's Monday), soonest first.
  const notes = items.map((it) => ({ ...it, sortKey: it.date || it.weekStart || '' })).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const box = document.querySelector('[data-plan-notes]');
  if (!box || !notes.length) return;
  box.innerHTML = `<p class="mt-4 text-xs font-semibold uppercase tracking-[0.15em] text-blue-700">From your advisor</p>
    <ul class="divide-y divide-ink-100">${notes.map((n) => noteRow(n)).join('')}</ul>`;
  box.classList.remove('hidden');
}

export async function initPrepPlan({ user, profile, first, links: eventLinks, attemptFilters, settings = {} }) {
  const card = document.querySelector('[data-plan-card]');
  const $ = (sel) => card.querySelector(sel);
  const body = $('[data-plan-body]');
  $('[data-plan-placeholder]').classList.add('hidden');
  $('[data-plan-soon]').classList.add('hidden');
  body.classList.remove('hidden');
  const type = planType(profile.eventCode);
  const weekCount = PLANS[type].weeks;

  if (!first?.date) {
    body.innerHTML = `<p class="mt-4 text-sm text-ink-600">Your advisor hasn't set your ${first?.label || 'District'} date yet. Your ${weekCount}-week plan will appear here once they do.</p>`;
    return;
  }

  const logQuery = () => (type === 'roleplay'
    ? getDocs(query(collection(db, 'roleplayLogs'), where('schoolId', '==', profile.schoolId), where('memberUids', 'array-contains', user.uid)))
      .then((snap) => snap.docs.map((d) => d.data()).filter((l) => l.eventCode === profile.eventCode))
    : Promise.resolve([]));
  const [examSnap, attemptSnap, firstLogs, teamSnap] = await Promise.all([
    takesExam(profile.eventCode) ? getDocs(query(collection(db, 'exams'), where('cluster', '==', profile.cluster))) : null,
    getDocs(query(collection(db, 'attempts'), ...attemptFilters())),
    logQuery(),
    getDocs(query(collection(db, 'teams'), where('schoolId', '==', profile.schoolId), where('memberUids', 'array-contains', user.uid))).catch(() => null),
  ]);
  const exams = (examSnap?.docs || []).map((d) => ({ id: d.id, ...d.data() })).filter((e) => e.active !== false);
  const attempts = attemptSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.track === profile.track);
  // The student's team for this event, if their advisor paired them.
  const teamDoc = (teamSnap?.docs || []).find((d) => d.data().eventCode === profile.eventCode);
  const team = teamDoc ? { id: teamDoc.id, ...teamDoc.data() } : null;
  const sharedIds = sharedTaskIds(profile.eventCode);
  let logs = firstLogs;
  let myChecks = { ...(profile.planChecks || {}) };
  let myLinks = { ...(profile.planLinks || {}) };
  let teamChecks = { ...(team?.planChecks || {}) };
  let teamLinks = { ...(team?.planLinks || {}) };
  const viewOnly = isViewingAs();
  const open = new Set(); // collapsed sections the student opened
  const replacing = new Set(); // link tasks showing the "replace link" box
  const onTeam = (id) => team && sharedIds.has(id);
  // Shared tasks come from the team; everything else is the student's own.
  const effectiveChecks = () => {
    const mine = Object.fromEntries(Object.entries(myChecks).filter(([id]) => !onTeam(id)));
    return team ? { ...mine, ...teamChecks } : mine;
  };
  const effectiveLinks = () => (team ? teamLinks : myLinks);
  const myName = `${profile.firstName} ${profile.lastName}`;
  // On a team, label team tasks only when the plan also has personal ones (exams).
  const mixed = !!team && takesExam(profile.eventCode);
  const INTRO = {
    roleplay: `An 8-week plan to get you ready for ${PLAN_NAME[first.level] || first.label}. Each week runs Monday to Sunday; finish that week's list by Sunday. Exams and role plays check off by themselves.`,
    written: `A 16-week plan for your written entry and presentation, ready for ${PLAN_NAME[first.level] || first.label}. Each week runs Monday to Sunday; finish that week's list by Sunday. Tasks with a link box check off when you share the link with your advisor.`,
    selling: `An 8-week plan to get you ready for ${PLAN_NAME[first.level] || first.label}: your cluster exams, plus building and practicing your presentation. Each week runs Monday to Sunday; finish that week's list by Sunday. Exams check off by themselves.`,
  };
  const teamNote = team
    ? `<p class="mt-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-800">Your team shares this plan. When one of you checks off a team task or shares a link, it counts for everyone.${takesExam(profile.eventCode) ? ' Exams and studying are your own.' : ''}</p>`
    : '';

  function render() {
    const plan = planStatus({
      eventCode: profile.eventCode, cluster: profile.cluster, exams, competitionDate: first.date, attempts, logs,
      checks: effectiveChecks(), links: effectiveLinks(), removed: settings.removed || [], excused: profile.planExcused || {},
    });
    const notes = advisorItems(settings.items, plan.weeks, { group: type === 'roleplay' ? 'roleplay' : 'prepared' });
    const pct = plan.totalCount ? Math.round((plan.doneCount / plan.totalCount) * 100) : 0;
    $('[data-plan-count]').textContent = `${plan.doneCount} of ${plan.totalCount} done`;
    $('[data-plan-bar]').style.width = `${pct}%`;

    const linkFor = (t) => (t.link === 'guidelines' && eventLinks.guidelines
      ? `<a href="${esc(eventLinks.guidelines)}" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline">Open guidelines</a>`
      : t.link === 'results' ? '<a href="results.html" class="text-blue-600 underline">My Results</a> · <a href="insights.html" class="text-blue-600 underline">Exam Deep Dive</a>'
        : t.kind === 'exam' && t.state !== 'done' ? `<a href="exam.html?id=${encodeURIComponent(t.examId)}" class="text-blue-600 underline">Go to exam</a>` : '');
    const BADGE = {
      overdue: '<span class="rounded-full bg-rose-100 text-rose-700 text-[11px] font-semibold px-2 py-0.5">Overdue</span>',
      soon: '<span class="rounded-full bg-tan-100 text-tan-700 text-[11px] font-semibold px-2 py-0.5">Coming soon</span>',
    };
    // A link task: the latest link shared, or a box to share one.
    const linkBox = (t) => {
      const history = effectiveLinks()[t.id] || [];
      const latest = history[history.length - 1];
      const form = viewOnly ? '' : `
        <form data-link-form="${esc(t.id)}" class="mt-1.5 flex flex-wrap gap-2">
          <input name="url" type="url" required maxlength="500" placeholder="Paste the link (Google Docs, Canva, Drive…)"
            class="flex-1 min-w-[12rem] rounded-lg border border-ink-300 px-2.5 py-1.5 text-sm" />
          <button class="rounded-lg bg-ink-900 text-cream-50 px-3 py-1.5 text-xs font-semibold hover:bg-ink-800">${latest ? 'Save new link' : 'Share link'}</button>
          ${latest ? `<button type="button" data-link-cancel="${esc(t.id)}" class="text-xs text-ink-500 underline">Cancel</button>` : ''}
        </form>
        <span class="block text-xs text-ink-500">Make sure your advisor can open it (in Google Docs: Share, then add your advisor or allow anyone with the link).</span>`;
      if (!latest) return form || '<span class="block text-xs text-ink-500">No link shared yet</span>';
      const when = new Date(latest.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return `
        <span class="block text-xs text-ink-500"><a href="${esc(latest.url)}" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline">Open your link</a> · shared ${esc(when)}${team ? ` by ${esc(latest.byName)}` : ''}${history.length > 1 ? ` · ${history.length} versions` : ''}
          ${viewOnly || replacing.has(t.id) ? '' : ` · <button type="button" data-link-replace="${esc(t.id)}" class="text-blue-600 underline">Replace</button>`}</span>
        ${replacing.has(t.id) ? form : ''}`;
    };
    const row = (t, { showWeek = false } = {}) => {
      const manual = t.kind === 'check';
      const auto = !manual && !['cards', 'link'].includes(t.kind) && t.state !== 'done' ? 'Checks off automatically' : '';
      const extra = [t.note, linkFor(t), auto, mixed && onTeam(t.id) && !/^(roleplay|judge|areas)$/.test(t.kind) ? 'Team task' : ''].filter(Boolean).join(' · ');
      return `
        <li class="flex items-start gap-3 py-2.5 ${t.state === 'done' ? 'text-ink-400' : ''}">
          <input type="checkbox" ${t.state === 'done' ? 'checked' : ''} ${manual && !viewOnly ? `data-plan-check="${esc(t.id)}"` : 'disabled'}
            class="mt-0.5 w-4 h-4 shrink-0 ${manual && !viewOnly ? 'cursor-pointer' : ''}" aria-label="${esc(t.label)}" />
          <span class="flex-1 min-w-0 text-sm">
            <span class="${t.state === 'done' ? 'line-through' : 'text-ink-900'}">${esc(t.label)}</span>
            ${extra ? `<span class="block text-xs text-ink-500">${extra}</span>` : ''}
            ${t.kind === 'link' ? linkBox(t) : ''}
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
    const intro = `<p class="mt-4 text-sm text-ink-600">${INTRO[type]}</p>${teamNote}`;

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
      <p class="mt-2 text-sm">${week ? `<strong>Week ${week.number} of ${weekCount}</strong> · ${esc(shortDate(week.start))}–${esc(shortDate(week.end))} · ` : `<strong>Your ${weekCount} weeks are done.</strong> Use the days before your competition for your own review. · `}${status}</p>
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
  // Saves one key of a map (planChecks or planLinks) on the team or the student.
  const target = (id) => (onTeam(id) ? doc(db, 'teams', team.id) : doc(db, 'users', user.uid));

  body.addEventListener('change', async (e) => {
    const box = e.target.closest('[data-plan-check]');
    if (!box) return;
    const id = box.dataset.planCheck;
    const checked = box.checked;
    const saved = { myChecks, teamChecks };
    const apply = (map) => { const next = { ...map }; if (checked) next[id] = true; else delete next[id]; return next; };
    if (onTeam(id)) teamChecks = apply(teamChecks); else myChecks = apply(myChecks);
    render();
    try {
      await updateDoc(target(id), { [`planChecks.${id}`]: checked ? true : deleteField() });
    } catch {
      ({ myChecks, teamChecks } = saved);
      render();
      alert("Couldn't save that. Please try again.");
    }
  });

  body.addEventListener('click', (e) => {
    const replace = e.target.closest('[data-link-replace]');
    const cancel = e.target.closest('[data-link-cancel]');
    if (replace) { replacing.add(replace.dataset.linkReplace); render(); }
    if (cancel) { replacing.delete(cancel.dataset.linkCancel); render(); }
  });

  body.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-link-form]');
    if (!form) return;
    e.preventDefault();
    const id = form.dataset.linkForm;
    const url = form.url.value.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) { alert('Paste a full link that starts with https://'); return; }
    const entry = { url, by: user.uid, byName: myName, at: new Date().toISOString() };
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      await updateDoc(target(id), { [`planLinks.${id}`]: arrayUnion(entry) });
      const add = (map) => ({ ...map, [id]: [...(map[id] || []), entry] });
      if (onTeam(id)) teamLinks = add(teamLinks); else myLinks = add(myLinks);
      replacing.delete(id);
      render();
    } catch {
      button.disabled = false;
      alert("Couldn't save that link. Please try again.");
    }
  });
  // A role play saved or deleted in the drawer below can check off a task.
  document.addEventListener('prep:logs-changed', async () => {
    try { logs = await logQuery(); render(); } catch {}
  });
  render();
}

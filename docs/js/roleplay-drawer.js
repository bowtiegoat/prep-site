// The Role Play Prep drawer on the Event Hub: steps, the tracking grid,
// the student's logs, and the form to log or edit a practice run.
//
// Team events: a log is shared with the teammates the advisor paired, and
// any of them can edit it.

import {
  addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, updateDoc, where,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db, esc, isViewingAs, today } from './app.js';
import {
  DECA_PAGE, GOAT_PAGE, decaTitle, INSTRUCTIONAL_AREAS, JUDGES, LEVELS, gridHtml, latestSummary, loadGoatRolePlays,
  logListHtml, rubricRows, rubricTypeFor, shortDate, sortLogs,
} from './roleplays.js';

const linkClass = 'font-semibold text-blue-600 underline decoration-blue-300 underline-offset-2 hover:decoration-blue-600';

export async function initRolePlayDrawer({ user, profile, event }) {
  const drawer = document.querySelector('[data-roleplay-drawer]');
  const $ = (sel) => drawer.querySelector(sel);
  const modal = document.querySelector('[data-log-modal]');
  const $m = (sel) => modal.querySelector(sel);
  drawer.classList.remove('hidden');

  const viewOnly = isViewingAs();
  const rubric = rubricTypeFor(profile.eventCode);
  const isTeamEvent = Number(String(event.competitors).split('-').pop()) > 1;
  const [prep, present] = isTeamEvent ? [30, 15] : [10, 10];

  $('[data-rp-steps]').innerHTML = [
    ['Pick a role play', `Use a <a href="${GOAT_PAGE}" target="_blank" rel="noopener noreferrer" class="${linkClass}">GOAT role play</a> or a sample from <a href="${DECA_PAGE}" target="_blank" rel="noopener noreferrer" class="${linkClass}">DECA's resources page</a>.`],
    ['Practice with a judge', `${prep} minutes to prepare, ${present} minutes to present. A classmate, teacher, or parent judges with the rubric.`],
    ['Log how it went', 'Record a level for each rubric row and your judge\'s feedback.'],
  ].map(([title, text], i) => `
    <li class="flex gap-3">
      <span class="shrink-0 w-7 h-7 rounded-full bg-ink-900 text-cream-50 grid place-items-center font-bold text-xs" aria-hidden="true">${i + 1}</span>
      <span><strong class="block text-ink-900">${title}</strong>${text}</span>
    </li>`).join('');
  $('[data-rp-new]').classList.toggle('hidden', viewOnly);

  // The student's team for this event, if their advisor made one.
  let team = null;
  try {
    const teamSnap = await getDocs(query(collection(db, 'teams'), where('schoolId', '==', profile.schoolId), where('memberUids', 'array-contains', user.uid)));
    team = teamSnap.docs.map((d) => ({ id: d.id, ...d.data() })).find((t) => t.eventCode === profile.eventCode) || null;
  } catch {}

  // The schoolId filter lets an advisor's "View as" pass the database rules.
  let logs = [];
  async function load() {
    const snap = await getDocs(query(collection(db, 'roleplayLogs'), where('schoolId', '==', profile.schoolId), where('memberUids', 'array-contains', user.uid)));
    // Only this event's runs; a different event has a different rubric.
    logs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((l) => l.eventCode === profile.eventCode);
    render();
  }

  function render() {
    const last = sortLogs(logs)[0];
    $('[data-rp-summary]').textContent = logs.length
      ? [`${logs.length} role play${logs.length === 1 ? '' : 's'} logged`, `last on ${shortDate(last.date)}`, latestSummary(logs)].filter(Boolean).join(' · ')
      : 'No role plays logged yet';
    $('[data-rp-grid]').innerHTML = logs.length
      ? gridHtml(logs, rubric)
      : `<p class="rounded-xl border-2 border-dashed border-ink-200 p-6 text-center text-sm text-ink-500">Your practice runs will show up here. ${viewOnly ? '' : 'Click <strong>Log a role play</strong> after your first one.'}</p>`;
    $('[data-rp-logs-wrap]').classList.toggle('hidden', !logs.length);
    $('[data-rp-logs]').innerHTML = logListHtml(logs, {
      viewerUid: user.uid,
      actions: (log) => (viewOnly ? '' : `<button data-edit-log="${esc(log.id)}" class="text-blue-600 underline">Edit</button>`),
    });
  }

  // ---------- Log form ----------
  const goat = await loadGoatRolePlays();
  let editing = null; // the log being edited, or null for a new one
  let source = 'goat';
  let levels = {};

  $m('[data-ia]').innerHTML = `<option value="">Choose the instructional area on page 1…</option>${
    Object.entries(INSTRUCTIONAL_AREAS).map(([group, areas]) => `<optgroup label="${esc(group)}">${areas.map((a) => `<option>${esc(a)}</option>`).join('')}</optgroup>`).join('')}`;
  $m('[data-judge]').innerHTML = `<option value="">Choose one…</option>${JUDGES.map((j) => `<option>${esc(j)}</option>`).join('')}`;
  $m('[data-team-note]').textContent = team ? 'This log is shared with your teammates. Any of you can edit it.' : '';

  function fillGoatPicker(selectedFile = '') {
    const showAll = $m('[data-show-all]').checked;
    const mine = goat.filter((rp) => rp.code === profile.eventCode);
    const others = goat.filter((rp) => rp.code !== profile.eventCode);
    const options = (list) => list.map((rp) => `<option value="${esc(rp.file)}" ${rp.file === selectedFile ? 'selected' : ''}>${esc(rp.title)} · ${esc(rp.ia)}</option>`).join('');
    const placeholder = '<option value="">Choose a GOAT role play…</option>';
    if (!goat.length) {
      $m('[data-goat-pick]').innerHTML = '<option value="">Couldn\'t load GOAT role plays. Try again later.</option>';
    } else if (showAll || !mine.length) {
      $m('[data-goat-pick]').innerHTML = placeholder
        + (mine.length ? `<optgroup label="Your event (${esc(profile.eventCode)})">${options(mine)}</optgroup>` : '')
        + [...new Set(others.map((rp) => rp.event))].sort().map((name) => `<optgroup label="${esc(name)}">${options(others.filter((rp) => rp.event === name))}</optgroup>`).join('');
    } else {
      $m('[data-goat-pick]').innerHTML = placeholder + options(mine);
    }
    $m('[data-goat-none]').classList.toggle('hidden', !!mine.length || !goat.length);
  }

  const chosenGoat = () => goat.find((rp) => rp.file === $m('[data-goat-pick]').value) || null;

  function renderRubric() {
    const rp = source === 'goat' ? chosenGoat() : null;
    $m('[data-goat-ia]').innerHTML = rp ? `Instructional area: <strong>${esc(rp.ia)}</strong>` : '';
    let group = '';
    $m('[data-rubric]').innerHTML = rubricRows(rubric).map((row) => {
      const head = row.group !== group ? `<p class="pt-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">${esc((group = row.group))}</p>` : '';
      const piText = row.pi != null ? (rp?.pis?.[row.pi] || (editing?.source === source && editing?.goatFile === rp?.file ? editing?.pis?.[row.pi] : '')) : '';
      return `${head}
        <div class="flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
          <span class="sm:w-2/5"><span class="font-semibold">${esc(row.label)}</span>${piText ? `<span class="block text-xs text-ink-500">${esc(piText)}</span>` : ''}</span>
          <span class="grid grid-cols-4 gap-1 sm:flex-1" role="group" aria-label="${esc(row.label)} level">
            ${LEVELS.map((l, i) => `
              <button type="button" data-row="${row.key}" data-level="${l.key}" aria-pressed="${levels[row.key] === l.key}"
                class="level-btn ${l.key} rounded-md border border-ink-300 px-1 py-1.5 text-xs font-semibold leading-tight hover:border-ink-500">
                ${l.name}<span class="block font-normal opacity-80">${row.ranges[i]}</span>
              </button>`).join('')}
          </span>
        </div>`;
    }).join('');
  }

  function setSource(next) {
    source = next;
    modal.querySelectorAll('[data-src]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.src === source)));
    $m('[data-goat-fields]').classList.toggle('hidden', source !== 'goat');
    $m('[data-deca-fields]').classList.toggle('hidden', source !== 'deca');
    renderRubric();
  }

  function openForm(log = null) {
    editing = log;
    levels = { ...(log?.levels || {}) };
    $m('[data-form-title]').textContent = log ? 'Edit role play log' : 'Log a role play';
    $m('[data-date]').value = log?.date || today();
    $m('[data-date]').max = today();
    $m('[data-show-all]').checked = !!(log?.goatFile && !goat.some((rp) => rp.file === log.goatFile && rp.code === profile.eventCode));
    fillGoatPicker(log?.goatFile || '');
    $m('[data-deca-url]').value = log?.source === 'deca' ? log.url : '';
    $m('[data-ia]').value = log?.source === 'deca' ? log.ia : '';
    $m('[data-judge]').value = log?.judge || '';
    $m('[data-score]').value = log?.score ?? '';
    $m('[data-video]').value = log?.videoUrl || '';
    $m('[data-feedback]').value = log?.feedback || '';
    $m('[data-delete]').classList.toggle('hidden', !log);
    $m('[data-error]').textContent = '';
    setSource(log?.source || 'goat');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeForm() {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  const isUrl = (value) => /^https?:\/\/\S+$/i.test(value);

  async function save() {
    const error = (text) => { $m('[data-error]').textContent = text; };
    const date = $m('[data-date]').value;
    if (!date) return error('Pick the date you practiced.');
    if (date > today()) return error("The date can't be in the future.");
    let title; let url; let ia; let pis = null; let goatFile = null;
    if (source === 'goat') {
      const rp = chosenGoat();
      if (!rp) return error('Choose which GOAT role play you practiced.');
      ({ title, url, ia } = rp);
      pis = rp.pis || null;
      goatFile = rp.file;
    } else {
      url = $m('[data-deca-url]').value.trim();
      if (!isUrl(url)) return error('Paste the link to the DECA role play PDF (it starts with https://).');
      ia = $m('[data-ia]').value;
      if (!ia) return error('Choose the instructional area. It\'s on page 1 of the role play.');
      title = decaTitle(url);
    }
    const rows = rubricRows(rubric);
    const rated = Object.fromEntries(rows.filter((r) => levels[r.key]).map((r) => [r.key, levels[r.key]]));
    if (!Object.keys(rated).length) return error('Choose a level for at least one rubric row.');
    const scoreText = $m('[data-score]').value.trim();
    const score = scoreText === '' ? null : Number(scoreText);
    if (score != null && !(Number.isInteger(score) && score >= 0 && score <= 100)) return error('The overall score must be a whole number from 0 to 100.');
    const videoUrl = $m('[data-video]').value.trim();
    if (videoUrl && !isUrl(videoUrl)) return error('The video link should start with https://.');

    const data = {
      date, source, goatFile, title, url, ia, pis, rubric, levels: rated, score, videoUrl,
      judge: $m('[data-judge]').value,
      feedback: $m('[data-feedback]').value.trim().slice(0, 5000),
      updatedAt: serverTimestamp(),
    };
    const button = $m('[data-save]');
    button.disabled = true;
    try {
      if (editing) {
        await updateDoc(doc(db, 'roleplayLogs', editing.id), data);
      } else {
        await addDoc(collection(db, 'roleplayLogs'), {
          ...data,
          memberUids: team ? team.memberUids : [user.uid],
          teamId: team ? team.id : null,
          schoolId: profile.schoolId,
          eventCode: profile.eventCode,
          createdBy: user.uid,
          createdByName: `${profile.firstName} ${profile.lastName}`,
          createdAt: serverTimestamp(),
        });
      }
      closeForm();
      await load();
    } catch {
      error("Your log couldn't be saved. Check your connection and try again.");
    } finally {
      button.disabled = false;
    }
  }

  async function remove() {
    if (!editing || !confirm(`Delete this log (${editing.title}, ${shortDate(editing.date)})?${editing.memberUids.length > 1 ? ' It will be removed for your teammates too.' : ''}`)) return;
    try {
      await deleteDoc(doc(db, 'roleplayLogs', editing.id));
      closeForm();
      await load();
    } catch {
      $m('[data-error]').textContent = "The log couldn't be deleted. Try again.";
    }
  }

  // ---------- Events ----------
  $('[data-rp-new]').addEventListener('click', () => openForm());
  $('[data-rp-logs]').addEventListener('click', (e) => {
    const button = e.target.closest('[data-edit-log]');
    if (button) openForm(logs.find((l) => l.id === button.dataset.editLog));
  });
  modal.querySelectorAll('[data-src]').forEach((b) => b.addEventListener('click', () => setSource(b.dataset.src)));
  $m('[data-show-all]').addEventListener('change', () => { fillGoatPicker($m('[data-goat-pick]').value); renderRubric(); });
  $m('[data-goat-pick]').addEventListener('change', renderRubric);
  $m('[data-rubric]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-level]');
    if (!b) return;
    // Clicking the chosen level again clears it ("Not rated").
    levels[b.dataset.row] = levels[b.dataset.row] === b.dataset.level ? undefined : b.dataset.level;
    b.parentElement.querySelectorAll('[data-level]').forEach((x) => x.setAttribute('aria-pressed', String(levels[b.dataset.row] === x.dataset.level)));
  });
  $m('[data-save]').addEventListener('click', save);
  $m('[data-delete]').addEventListener('click', remove);
  modal.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeForm));
  modal.addEventListener('click', (e) => { if (e.target === modal) closeForm(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeForm(); });

  await load();
}

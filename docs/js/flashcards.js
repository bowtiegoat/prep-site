// PI flashcards: decks, study sessions, and the record of which PIs a
// student keeps missing. No Firebase calls, so it can be tried outside the browser.
//
// - A deck (flashDecks/{deckId}) holds every card for a group of events, e.g.
//   all Principles events share one deck. A card's area is the instructional
//   area of the role play(s) its PI appeared in (a role play can include PIs
//   from other areas), and it lists the events whose district area that is.
//   deck.districtAreas maps each event to this year's district area.
// - A student studies the Districts deck (their event's district cards) or
//   the All PIs deck. Cards are shuffled each session. "I know it" takes a
//   card out of the session; "Still learning" puts it back in the pile.
// - Progress (cardProgress/{uid}) keeps each session's state and, per PI,
//   how many sessions the card was seen in and how many it was missed in.
//   A miss counts once per card per session.
// - A study day (for the prep plan) is a day with STUDY_DAY_CARDS+ cards flipped.

export const DECKS = {
  principles: { name: 'Principles', events: ['PBM', 'PEN', 'PFN', 'PHT', 'PMK'] },
};
export const STUDY_DAY_CARDS = 10;
export const SESSION_KINDS = { district: 'Districts', all: 'All PIs' };

const ymd = (date = new Date()) => date.toLocaleDateString('en-CA');

// The deck an event studies, or null (no cards for that event yet).
export function deckIdFor(eventCode) {
  return Object.keys(DECKS).find((id) => DECKS[id].events.includes(eventCode)) || null;
}

// The cards in a session: the event's district cards, or the whole deck.
export function sessionCards(deck, eventCode, kind) {
  const cards = deck?.cards || [];
  return kind === 'district' ? cards.filter((c) => (c.districts || []).includes(eventCode)) : cards;
}

// Fisher-Yates shuffle of PI codes.
export function shuffled(codes, random = Math.random) {
  const list = [...codes];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// A fresh session over these cards: a shuffled pile, nothing known yet.
export function newSession(cards, random) {
  return { id: Math.random().toString(36).slice(2, 10), pile: shuffled(cards.map((c) => c.code), random), known: [], seen: [], missed: [], startedAt: new Date().toISOString() };
}

// Keeps a saved session in step with the deck (cards added or removed since).
export function syncSession(session, cards) {
  const codes = new Set(cards.map((c) => c.code));
  if (!session) return null;
  const known = session.known.filter((c) => codes.has(c));
  const inPile = new Set([...session.pile.filter((c) => codes.has(c)), ...known]);
  const added = shuffled([...codes].filter((c) => !inPile.has(c)));
  return { ...session, known, pile: [...session.pile.filter((c) => codes.has(c) && !known.includes(c)), ...added] };
}

// Records the student's answer for the card on top of the pile and returns
// the new progress. knew = true for "I know it", false for "Still learning".
export function answer(progress, kind, knew, today = ymd()) {
  const session = progress.sessions[kind];
  const code = session.pile[0];
  if (!code) return progress;
  const stats = { ...(progress.stats || {}) };
  const s = { seen: 0, missed: 0, ...(stats[code] || {}) };
  const seen = session.seen.includes(code) ? session.seen : [...session.seen, code];
  if (!session.seen.includes(code)) s.seen += 1;
  let { missed } = session;
  if (!knew && !session.missed.includes(code)) {
    s.missed += 1;
    missed = [...missed, code];
  }
  stats[code] = s;
  const rest = session.pile.slice(1);
  // "Still learning" goes back in the pile a few cards later (or last, near the end).
  const pile = knew ? rest : [...rest.slice(0, 3), code, ...rest.slice(3)];
  const known = knew ? [...session.known, code] : session.known;
  const studyDays = { ...(progress.studyDays || {}), [today]: ((progress.studyDays || {})[today] || 0) + 1 };
  return {
    ...progress,
    stats,
    studyDays,
    sessions: { ...progress.sessions, [kind]: { ...session, pile, known, seen, missed } },
  };
}

// PIs the student has missed, most consistent first: "missed 3 of 4 sessions".
export function missedPis(progress, deck) {
  const byCode = new Map((deck?.cards || []).map((c) => [c.code, c]));
  return Object.entries(progress?.stats || {})
    .filter(([code, s]) => s.missed > 0 && byCode.has(code))
    .map(([code, s]) => ({ ...byCode.get(code), seen: s.seen, missed: s.missed, rate: s.missed / s.seen }))
    .sort((a, b) => b.rate - a.rate || b.missed - a.missed || a.code.localeCompare(b.code));
}

// Days in [start, end] (YYYY-MM-DD) with enough cards flipped to count.
export function studyDaysBetween(studyDays = {}, start, end) {
  return Object.entries(studyDays).filter(([day, n]) => day >= start && day <= end && n >= STUDY_DAY_CARDS).length;
}

// The district instructional area for an event, from the deck.
export function districtAreaFor(deck, eventCode) {
  return deck?.districtAreas?.[eventCode] || '';
}

// Reads the review spreadsheet's "District decks" sheet: Event | District instructional area.
export function parseDistrictRows(rows, deckId) {
  const events = new Set(DECKS[deckId]?.events || []);
  const areas = {};
  rows.forEach((row) => {
    const values = Object.values(row).map((v) => String(v ?? '').trim());
    if (events.has(values[0]) && values[1]) areas[values[0]] = values[1];
  });
  return areas;
}

// Reads the review spreadsheet ("Cards" sheet) into deck cards, and lists problems.
// Columns: Instructional Area, PI Code, Performance Indicator (front), Short Meaning (back), District decks
export function parseCardRows(rows, deckId) {
  const errors = [];
  const cards = [];
  const seen = new Set();
  const events = new Set(DECKS[deckId]?.events || []);
  const pick = (row, ...names) => {
    const key = Object.keys(row).find((k) => names.some((n) => k.trim().toLowerCase().startsWith(n)));
    return key ? String(row[key] ?? '').trim() : '';
  };
  rows.forEach((row, i) => {
    const line = i + 2;
    const code = pick(row, 'pi code');
    const pi = pick(row, 'performance indicator');
    const back = pick(row, 'short meaning');
    if (!code && !pi && !back) return;
    const area = pick(row, 'instructional area');
    const districts = pick(row, 'district').split(/[,;\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!/^[A-Z]{2,3}:\d{3}$/.test(code)) errors.push(`Row ${line}: PI Code "${code}" should look like CO:016.`);
    if (!pi) errors.push(`Row ${line}: the performance indicator is missing.`);
    if (!back) errors.push(`Row ${line}: the short meaning (card back) is missing.`);
    if (back.length > 600) errors.push(`Row ${line}: the card back is ${back.length} characters; keep it under 600.`);
    if (seen.has(code)) errors.push(`Row ${line}: ${code} appears twice.`);
    districts.filter((e) => !events.has(e)).forEach((e) => errors.push(`Row ${line}: "${e}" isn't an event in this deck.`));
    seen.add(code);
    cards.push({ code, pi, area, back, districts });
  });
  if (!cards.length) errors.push('No cards found. Use the "Cards" sheet of the review spreadsheet.');
  return { cards, errors };
}

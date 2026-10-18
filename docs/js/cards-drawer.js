// The PI Cards drawer on the Event Hub: the two decks (Districts and All
// PIs) with this session's progress, and the PIs the student misses most.

import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db, esc } from './app.js';
import { DECKS, STUDY_DAY_CARDS, deckIdFor, districtAreaFor, missedPis, sessionCards } from './flashcards.js';

export async function initCardsDrawer({ user, profile }) {
  const drawer = document.querySelector('[data-cards-drawer]');
  const summary = drawer.querySelector('[data-cards-summary]');
  const body = drawer.querySelector('[data-cards-body]');
  drawer.classList.remove('hidden');

  const deckId = deckIdFor(profile.eventCode);
  const [deckSnap, progressSnap] = await Promise.all([
    deckId ? getDoc(doc(db, 'flashDecks', deckId)).catch(() => null) : null,
    getDoc(doc(db, 'cardProgress', user.uid)).catch(() => null),
  ]);
  const deck = deckSnap?.exists() ? deckSnap.data() : null;
  if (!deck) {
    summary.textContent = 'Coming soon for your event';
    body.innerHTML = `<p class="text-sm text-ink-600">Flashcards for the performance indicators in ${esc(profile.eventName)} are on the way. Cards are being added one career cluster at a time.</p>`;
    return;
  }
  const progress = progressSnap?.exists() ? progressSnap.data() : { sessions: {}, stats: {} };
  const district = sessionCards(deck, profile.eventCode, 'district');
  const area = districtAreaFor(deck, profile.eventCode);

  const tile = (kind, title, note, cards) => {
    const s = progress.sessions?.[kind];
    const current = s && (kind === 'all' || s.eventCode === profile.eventCode);
    const known = current ? s.known.filter((c) => cards.some((x) => x.code === c)).length : 0;
    const pct = cards.length ? Math.round((known / cards.length) * 100) : 0;
    return `
      <a href="flashcards.html?deck=${kind}" class="block rounded-xl border border-ink-200 p-4 hover:border-blue-500">
        <span class="flex items-baseline justify-between gap-3">
          <span class="font-semibold">${title}</span>
          <span class="text-sm text-ink-500">${cards.length} cards</span>
        </span>
        <span class="block text-xs text-ink-500">${esc(note)}</span>
        <span class="mt-3 block h-2 rounded-full bg-ink-100"><span class="block h-2 rounded-full bg-green-600" style="width:${pct}%"></span></span>
        <span class="mt-1 flex justify-between text-xs text-ink-500"><span>${known} known this session</span><span class="font-semibold text-blue-600">${known ? 'Keep going' : 'Study'} →</span></span>
      </a>`;
  };

  const missed = missedPis(progress, deck).slice(0, 3);
  const knownDistrict = progress.sessions?.district?.eventCode === profile.eventCode ? progress.sessions.district.known.length : 0;
  summary.textContent = `${district.length} district cards${area ? ` (${area})` : ''} · ${deck.cards.length} in all${knownDistrict ? ` · ${knownDistrict} known this session` : ''}`;
  body.innerHTML = `
    <p class="text-sm text-ink-600">Flip a card, say what the PI means, then check yourself. Cards you know leave the session; the rest come back around. Studying ${STUDY_DAY_CARDS}+ cards in a day counts toward your prep plan.</p>
    <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
      ${district.length ? tile('district', 'Districts deck', `Your district area${area.includes(' · ') ? 's' : ''}: ${area}`, district) : ''}
      ${tile('all', 'All PIs deck', `Every ${DECKS[deckId].name} performance indicator`, deck.cards)}
    </div>
    ${missed.length ? `
      <p class="mt-5 text-xs font-semibold uppercase tracking-[0.15em] text-ink-500">You miss these most</p>
      <ul class="mt-1 divide-y divide-ink-100 text-sm">
        ${missed.map((m) => `<li class="flex items-baseline justify-between gap-3 py-2"><span>${esc(m.pi)} <span class="font-mono text-xs text-ink-500">${esc(m.code)}</span></span><span class="shrink-0 text-xs text-ink-500">missed ${m.missed} of ${m.seen}</span></li>`).join('')}
      </ul>
      <a href="results.html" class="mt-1 inline-block text-sm text-blue-600 underline">See them all on My Results</a>` : ''}`;
}

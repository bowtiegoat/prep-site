// DEMO ONLY: the sample school for this browser tab. Nothing leaves the
// visitor's browser, and no two visitors share anything.
//
// The school is generated fresh from today's date (see seed.js). Changes the
// visitor makes (excusing tasks, archiving a student...) are kept while they
// move between pages, and a refresh starts over. Dates are stored as {"__ts": iso}.

import { buildDemo } from './seed.js';

const KEY = 'prep-demo:changes:v1';
const SIGNED_IN = 'prep-demo:signedIn';
// Tables the visitor can change. The rest (exams, stats, decks) is rebuilt on every page.
const CHANGEABLE = ['users', 'teams', 'schools', 'attempts', 'roleplayLogs', 'cardProgress', 'advisors'];

export const ADVISOR_USER = { uid: 'demo-advisor', email: 'taylor.morgan@example.com', emailVerified: true };
export const DEMO_USER = ADVISOR_USER;
export const currentDemoUser = () => ADVISOR_USER;

export function timestamp(date) {
  const d = new Date(date);
  return { __ts: d.toISOString(), toDate: () => d, toMillis: () => d.getTime() };
}

function revive(value) {
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === 'object') {
    if ('__ts' in value) return timestamp(value.__ts);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revive(v)]));
  }
  return value;
}

const session = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
  remove: (k) => { try { sessionStorage.removeItem(k); } catch {} },
};

// A refresh (not moving between pages) starts the demo over.
if (performance.getEntriesByType?.('navigation')?.[0]?.type === 'reload') session.remove(KEY);

let db = null;
export async function ready() {
  if (db) return db;
  const data = await (await fetch(new URL('./data/demo-data.json', import.meta.url))).json();
  db = revive(JSON.parse(JSON.stringify(buildDemo(data))));
  const saved = session.get(KEY);
  if (saved) {
    try { Object.assign(db, revive(JSON.parse(saved))); } catch {}
  }
  return db;
}

export function save() {
  session.set(KEY, JSON.stringify(Object.fromEntries(CHANGEABLE.map((t) => [t, db[t] || {}]))));
}

export function table(name) {
  db[name] = db[name] || {};
  return db[name];
}

export function resetDemo() {
  session.remove(KEY);
  location.reload();
}

export const isSignedIn = () => session.get(SIGNED_IN) !== 'no';
export const setSignedIn = (yes) => session.set(SIGNED_IN, yes ? 'yes' : 'no');

// A bar on every page so the demo is never mistaken for a real school.
export function previewBar() {
  if (document.querySelector('[data-demo-bar]')) return;
  const bar = document.createElement('div');
  bar.setAttribute('data-demo-bar', '');
  bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:50;background:#141a2e;color:#fdfaf0;font:500 13px/1.4 "Open Sans",system-ui,sans-serif;padding:10px 16px;display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;justify-content:center;text-align:center';
  bar.innerHTML = `
    <span><strong>Demo:</strong> GOAT Academy is a sample chapter with pretend students. Try anything; a refresh starts over.</span>
    <button type="button" data-demo-reset style="text-decoration:underline">Reset the demo</button>
    <a href="https://www.thebowtiegoat.com" style="text-decoration:underline">About BowtieGOAT</a>`;
  bar.querySelector('[data-demo-reset]').addEventListener('click', resetDemo);
  document.body.appendChild(bar);
  document.body.style.paddingBottom = '64px';
}

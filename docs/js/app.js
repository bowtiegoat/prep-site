// Shared setup for every page: Firebase, sign-in guard, header, small helpers.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { firebaseConfig } from './firebase-config.js';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
const functions = getFunctions(app, 'us-central1');

export const ADMIN_EMAIL = 'justin@thebowtiegoat.com';
export const EXAM_MINUTES = 90;
export const MIN_TAKERS_FOR_PERCENTILE = 10;

export function isAdmin(user) {
  return !!user && user.email === ADMIN_EMAIL && user.emailVerified;
}

export async function call(name, data) {
  try {
    const result = await httpsCallable(functions, name)(data);
    return result.data;
  } catch (err) {
    // Server crashes come back as code "internal"; their message isn't meant for people.
    const message = err.code === 'functions/internal' || !err.message
      ? 'Something went wrong on our end. Please try again in a minute.'
      : err.message;
    throw new Error(message);
  }
}

function currentUser() {
  return new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, (user) => { stop(); resolve(user); });
  });
}

// Sends visitors to the right place:
// - not signed in -> sign-in page
// - signed in, no profile -> join page (unless the page allows that)
// Returns { user, profile }.
export async function requireUser({ allowNoProfile = false, adminOnly = false } = {}) {
  const user = await currentUser();
  if (!user) {
    location.replace('index.html');
    return new Promise(() => {});
  }
  if (adminOnly) {
    if (!isAdmin(user)) {
      location.replace('exams.html');
      return new Promise(() => {});
    }
    return { user, profile: null };
  }
  const snap = await getDoc(doc(db, 'users', user.uid));
  const profile = snap.exists() ? snap.data() : null;
  if (!profile && !allowNoProfile) {
    location.replace(isAdmin(user) ? 'admin.html' : 'join.html');
    return new Promise(() => {});
  }
  return { user, profile };
}

export function renderHeader({ user, profile, active }) {
  const links = [];
  if (profile) {
    links.push(['exams.html', 'Exams', 'exams']);
    links.push(['results.html', 'My Results', 'results']);
    links.push(['profile.html', 'Profile', 'profile']);
  }
  if (isAdmin(user)) links.push(['admin.html', 'Admin', 'admin']);
  const header = document.querySelector('[data-header]');
  header.innerHTML = `
    <nav class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
      <a href="exams.html" class="flex items-center gap-3 shrink-0">
        <img src="images/logo.jpg" alt="BowtieGOAT logo" class="w-9 h-9 rounded-lg object-cover" />
        <span class="flex flex-col leading-tight">
          <span class="font-serif text-lg font-bold text-ink-900">BowtieGOAT</span>
          <span class="text-[10px] font-medium uppercase tracking-[0.15em] text-blue-600">Exam Tracker</span>
        </span>
      </a>
      <div class="flex items-center gap-1 sm:gap-2 text-sm overflow-x-auto">
        ${links.map(([href, label, key]) => `
          <a href="${href}" class="px-2 sm:px-3 py-2 rounded-md whitespace-nowrap ${key === active ? 'bg-ink-900 text-cream-50' : 'text-ink-700 hover:bg-ink-100'}">${label}</a>
        `).join('')}
        <button data-sign-out class="px-2 sm:px-3 py-2 rounded-md text-ink-500 hover:bg-ink-100 whitespace-nowrap">Sign out</button>
      </div>
    </nav>`;
  header.querySelector('[data-sign-out]').addEventListener('click', async () => {
    await signOut(auth);
    location.replace('index.html');
  });
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Escapes text and turns web addresses into links.
export function linkify(value) {
  return esc(value).replace(/https?:\/\/[^\s<]+[^\s<.,;)]/g, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline break-all">${url}</a>`);
}

export function formatDate(timestamp) {
  const date = timestamp?.toDate ? timestamp.toDate() : timestamp;
  if (!date) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Mid-rank percentile; matches functions/grading.js.
export function percentile(histogram, correct, takers) {
  if (!takers) return null;
  let below = 0;
  for (let n = 0; n < correct; n += 1) below += histogram[n] || 0;
  const equal = histogram[correct] || 0;
  return Math.round(((below + equal / 2) / takers) * 100);
}

export function percentileText(value, takers) {
  if (value == null || takers < MIN_TAKERS_FOR_PERCENTILE) return 'Not enough test-takers yet';
  return `${ordinal(value)} percentile`;
}

export function show(el, visible = true) {
  el.classList.toggle('hidden', !visible);
}

// Exams sort newest year first, then Districts, States, ICDC.
const LEVEL_ORDER = { Districts: 1, States: 2, ICDC: 3 };
export function compareExams(a, b) {
  if (a.year !== b.year) return a.year < b.year ? 1 : -1;
  return (LEVEL_ORDER[a.level] || 9) - (LEVEL_ORDER[b.level] || 9);
}

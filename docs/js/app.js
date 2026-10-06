// Shared setup for every page: Firebase, sign-in guard, header, small helpers.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
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

// ICDC is the same for every school; the admin can override it in Admin.
export const DEFAULT_ICDC = { start: '2027-04-17', end: '2027-04-20', location: 'Anaheim, CA' };

export async function loadIcdc() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'site'));
    return (snap.exists() && snap.data().icdc) || DEFAULT_ICDC;
  } catch {
    return DEFAULT_ICDC;
  }
}

// Advisors are stored by lowercase email: advisors/{email} = { name, email, schoolId }.
let advisorInfo = null;
async function findAdvisor(user) {
  if (!user?.email || !user.emailVerified) return null;
  try {
    const snap = await getDoc(doc(db, 'advisors', user.email.toLowerCase()));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

// YYYY-MM-DD in the viewer's time zone.
export function today() {
  return new Date().toLocaleDateString('en-CA');
}

// ---------- View as (read-only) ----------
// The admin, or an advisor for their own students, can look at the site
// exactly as a student sees it. The admin can also look at any school's
// advisor hub. The choice is kept for this browser tab only. While viewing,
// every change is blocked here, and the database rules separately stop
// writes to a student's account.

const VIEW_AS_KEY = 'prep:viewAs';
const VIEW_HUB_KEY = 'prep:viewHub';
const RETURN_KEY = 'prep:viewReturn';
const VIEW_ONLY_MESSAGE = "You're viewing as a student, so changes are turned off.";
let viewing = null; // { uid, name } while viewing as a student

export function startViewingAs(uid, returnTo = 'admin.html') {
  try {
    sessionStorage.setItem(VIEW_AS_KEY, uid);
    sessionStorage.setItem(RETURN_KEY, returnTo);
  } catch {}
}

export function stopViewingAs() {
  try { sessionStorage.removeItem(VIEW_AS_KEY); } catch {}
}

// Admin only: open a school's advisor hub, view only.
export function startViewingHub(schoolId) {
  try { sessionStorage.setItem(VIEW_HUB_KEY, schoolId); } catch {}
}

export function stopViewingHub() {
  try { sessionStorage.removeItem(VIEW_HUB_KEY); } catch {}
}

function viewReturn() {
  try { return sessionStorage.getItem(RETURN_KEY) || 'admin.html'; } catch { return 'admin.html'; }
}

export function isViewingAs() {
  return !!viewing;
}

function viewAsUid() {
  try { return sessionStorage.getItem(VIEW_AS_KEY); } catch { return null; }
}

export async function call(name, data) {
  if (viewing) throw new Error(VIEW_ONLY_MESSAGE);
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

const stay = () => new Promise(() => {});

// Sends visitors to the right place:
// - not signed in -> sign-in page
// - advisors -> advisor hub; admin -> admin page (when they have no student profile)
// - signed in, no profile -> join page (unless the page allows that)
// Returns { user, profile } (student pages), or { user, advisor } (advisorOnly).
export async function requireUser({ allowNoProfile = false, adminOnly = false, advisorOnly = false } = {}) {
  const user = await currentUser();
  if (!user) {
    location.replace('index.html');
    return stay();
  }
  if (adminOnly) {
    stopViewingAs();
    stopViewingHub();
    if (!isAdmin(user)) {
      location.replace('eventhub.html');
      return stay();
    }
    return { user, profile: null };
  }

  advisorInfo = await findAdvisor(user);

  if (advisorOnly) {
    stopViewingAs();
    let hubSchool = null;
    try { hubSchool = sessionStorage.getItem(VIEW_HUB_KEY); } catch {}
    if (isAdmin(user) && hubSchool) {
      return { user, advisor: { schoolId: hubSchool, name: 'BowtieGOAT admin', viewOnly: true } };
    }
    if (!advisorInfo) {
      location.replace(isAdmin(user) ? 'admin.html' : 'eventhub.html');
      return stay();
    }
    return { user, advisor: { ...advisorInfo, viewOnly: false } };
  }

  const asUid = isAdmin(user) || advisorInfo ? viewAsUid() : null;
  if (asUid) {
    try {
      const asSnap = await getDoc(doc(db, 'users', asUid));
      if (asSnap.exists()) {
        const asProfile = asSnap.data();
        viewing = { uid: asUid, name: `${asProfile.firstName} ${asProfile.lastName}` };
        // Pages read data for "user", so hand them the student's identity.
        return { user: { uid: asUid, email: asProfile.email, emailVerified: true }, profile: asProfile };
      }
    } catch {}
    stopViewingAs();
  }
  const snap = await getDoc(doc(db, 'users', user.uid));
  const profile = snap.exists() ? snap.data() : null;
  if (!profile && !allowNoProfile) {
    location.replace(isAdmin(user) ? 'admin.html' : advisorInfo ? 'advisor.html' : 'join.html');
    return stay();
  }
  // Record the student's last active day (once a day) for their advisor.
  if (profile && profile.lastActiveDate !== today()) {
    updateDoc(doc(db, 'users', user.uid), { lastActiveDate: today() }).catch(() => {});
  }
  return { user, profile };
}

export function renderHeader({ user, profile, active }) {
  const links = [];
  if (profile) {
    links.push(['eventhub.html', 'Event Hub', 'exams']);
    links.push(['results.html', 'My Results', 'results']);
    links.push(['profile.html', 'Profile', 'profile']);
  }
  if (advisorInfo) links.push(['advisor.html', 'Advisor hub', 'advisor']);
  if (isAdmin(user) || (viewing && viewReturn() === 'admin.html')) links.push(['admin.html', 'Admin', 'admin']);
  const header = document.querySelector('[data-header]');
  header.innerHTML = `
    ${viewing ? `
      <div class="bg-tan-600 text-white text-sm">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <span>👁️ Viewing as <strong>${esc(viewing.name)}</strong> (student). View only: nothing can be changed.</span>
          <button data-exit-view-as class="underline font-medium">Exit view-as</button>
        </div>
      </div>` : ''}
    <nav class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
      <a href="eventhub.html" class="flex items-center gap-3 shrink-0">
        <img src="images/logo.png" alt="BowtieGOAT logo" class="w-9 h-9" />
        <span class="flex flex-col leading-tight">
          <span class="wordmark text-lg text-ink-900">BowtieGOAT</span>
          <span class="text-[11px] font-semibold tracking-[0.08em] text-blue-600">GOATS get GLASS</span>
        </span>
      </a>
      <div class="flex items-center gap-1 sm:gap-2 text-sm overflow-x-auto">
        ${links.map(([href, label, key]) => `
          <a href="${href}" class="px-2 sm:px-3 py-2 rounded-md whitespace-nowrap ${key === active ? 'bg-ink-900 text-cream-50' : 'text-ink-700 hover:bg-ink-100'}">${label}</a>
        `).join('')}
        <button data-sign-out class="px-2 sm:px-3 py-2 rounded-md text-ink-500 hover:bg-ink-100 whitespace-nowrap">Sign out</button>
      </div>
    </nav>`;
  header.querySelector('[data-exit-view-as]')?.addEventListener('click', () => {
    const back = viewReturn();
    stopViewingAs();
    location.href = back;
  });
  header.querySelector('[data-sign-out]').addEventListener('click', async () => {
    stopViewingAs();
    stopViewingHub();
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

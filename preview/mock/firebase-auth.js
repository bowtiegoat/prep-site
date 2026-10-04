// PREVIEW ONLY: pretend sign-in. Every sign-in method signs in the sample student.
import { DEMO_USER, ready, isSignedIn, setSignedIn, previewBar } from './store.js';

const auth = { currentUser: null };
const listeners = new Set();

function notify() {
  auth.currentUser = isSignedIn() ? DEMO_USER : null;
  listeners.forEach((cb) => cb(auth.currentUser));
}

export function getAuth() {
  return auth;
}

export function onAuthStateChanged(_auth, callback) {
  listeners.add(callback);
  ready().then(() => {
    previewBar();
    auth.currentUser = isSignedIn() ? DEMO_USER : null;
    callback(auth.currentUser);
  });
  return () => listeners.delete(callback);
}

export class GoogleAuthProvider {}

export async function signInWithPopup() {
  setSignedIn(true);
  notify();
  return { user: DEMO_USER };
}

export async function signOut() {
  setSignedIn(false);
  notify();
}

// Email links: pretend the email arrived and was clicked right away.
export async function sendSignInLinkToEmail() {
  setTimeout(() => { setSignedIn(true); location.href = '/exams.html'; }, 1500);
}
export const isSignInWithEmailLink = () => false;
export async function signInWithEmailLink() {
  setSignedIn(true);
  notify();
}

// DEMO ONLY: visitors are signed in as the sample advisor. Signing out goes
// back to the demo's welcome page.
import { currentDemoUser, ready, isSignedIn, setSignedIn, previewBar } from './store.js';

const auth = { currentUser: null };

export function getAuth() {
  return auth;
}

export function onAuthStateChanged(_auth, callback) {
  ready().then(() => {
    previewBar();
    auth.currentUser = isSignedIn() ? currentDemoUser() : null;
    callback(auth.currentUser);
  });
  return () => {};
}

export class GoogleAuthProvider {}

export async function signInWithPopup() {
  setSignedIn(true);
  location.href = 'advisor.html';
  return { user: currentDemoUser() };
}

export async function signOut() {
  setSignedIn(false);
}

export async function sendSignInLinkToEmail() {
  setSignedIn(true);
  location.href = 'advisor.html';
}
export const isSignInWithEmailLink = () => false;
export async function signInWithEmailLink() {
  setSignedIn(true);
}

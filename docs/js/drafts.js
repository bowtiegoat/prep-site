// In-progress answers live only in this browser until the student submits.

export function draftKey(uid, track, examId) {
  return `prep:draft:${uid}:${track}:${examId}`;
}

export function loadDraft(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value && Array.isArray(value.answers) ? value : null;
  } catch {
    return null;
  }
}

export function saveDraft(key, draft) {
  try { localStorage.setItem(key, JSON.stringify(draft)); } catch {}
}

export function clearDraft(key) {
  try { localStorage.removeItem(key); } catch {}
}

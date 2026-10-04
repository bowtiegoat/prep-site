// PREVIEW ONLY: the Firestore calls the site uses, backed by store.js.
import { ready, save, table, timestamp } from './store.js';

export const getFirestore = () => ({});
export const collection = (_db, name) => ({ name });
export const doc = (_db, name, id) => ({ name, id });
export const where = (field, op, value) => ({ field, op, value });
export const query = (ref, ...conditions) => ({ name: ref.name, conditions });
export const serverTimestamp = () => timestamp(new Date());
export const arrayUnion = (...items) => ({ __arrayUnion: items });
export const arrayRemove = (...items) => ({ __arrayRemove: items });

function snapshot(id, data) {
  return { id, exists: () => data !== undefined, data: () => data };
}

export async function getDoc(ref) {
  await ready();
  return snapshot(ref.id, table(ref.name)[ref.id]);
}

export async function getDocs(ref) {
  await ready();
  const rows = Object.entries(table(ref.name))
    .filter(([, data]) => (ref.conditions || []).every((c) => data[c.field] === c.value));
  return { docs: rows.map(([id, data]) => snapshot(id, data)) };
}

export async function updateDoc(ref, changes) {
  await ready();
  const data = table(ref.name)[ref.id];
  for (const [key, value] of Object.entries(changes)) {
    const current = data[key] || [];
    if (value && value.__arrayUnion) data[key] = [...new Set([...current, ...value.__arrayUnion])];
    else if (value && value.__arrayRemove) data[key] = current.filter((v) => !value.__arrayRemove.includes(v));
    else data[key] = value;
  }
  save();
}

export async function setDoc(ref, data) {
  await ready();
  table(ref.name)[ref.id] = data;
  save();
}

export async function addDoc(ref, data) {
  const id = Math.random().toString(36).slice(2, 12);
  await setDoc({ name: ref.name, id }, data);
  return { id };
}

export async function deleteDoc(ref) {
  await ready();
  delete table(ref.name)[ref.id];
  save();
}

export function writeBatch() {
  const ops = [];
  return {
    set: (ref, data) => ops.push(() => setDoc(ref, data)),
    async commit() { for (const op of ops) await op(); },
  };
}

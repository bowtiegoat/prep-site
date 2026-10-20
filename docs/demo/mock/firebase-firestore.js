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
export const deleteField = () => ({ __deleteField: true });

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
    .filter(([, data]) => (ref.conditions || []).every((c) => (c.op === 'array-contains'
      ? (data[c.field] || []).includes(c.value)
      : data[c.field] === c.value)));
  return { docs: rows.map(([id, data]) => snapshot(id, data)) };
}

export async function updateDoc(ref, changes) {
  await ready();
  const data = table(ref.name)[ref.id];
  for (const [path, value] of Object.entries(changes)) {
    // "planChecks.w-topic" updates one key inside a map, like Firestore.
    const keys = path.split('.');
    let parent = data;
    keys.slice(0, -1).forEach((k) => { parent = parent[k] ||= {}; });
    const key = keys[keys.length - 1];
    const current = parent[key] || [];
    if (value && value.__deleteField) delete parent[key];
    else if (value && value.__arrayUnion) parent[key] = [...current, ...value.__arrayUnion.filter((v) => !current.some((c) => JSON.stringify(c) === JSON.stringify(v)))];
    else if (value && value.__arrayRemove) parent[key] = current.filter((v) => !value.__arrayRemove.includes(v));
    else parent[key] = value;
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

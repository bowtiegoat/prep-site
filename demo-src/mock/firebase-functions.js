// DEMO ONLY: the one server action an advisor uses (deleting an exam try),
// run in the browser. Everything else students do through the server isn't
// part of the demo.
import { ready, save, table } from './store.js';

const fail = (message) => { throw Object.assign(new Error(message), { code: 'functions/failed-precondition' }); };

const handlers = {
  async deleteAttempt({ attemptId }) {
    delete table('attempts')[attemptId];
    save();
    return { ok: true };
  },
};

export const getFunctions = () => ({});

export function httpsCallable(_functions, name) {
  return async (data) => {
    await ready();
    if (!handlers[name]) fail('This isn\'t available in the demo.');
    await new Promise((r) => setTimeout(r, 300));
    return { data: await handlers[name](data || {}) };
  };
}

// Students with more than one event (an advisor turns this on for their
// school: schools/{id}.eventSettings = { multi: true, max: 2 or 3 }).
//
// - users/{uid}.eventCode / eventName / cluster stay the student's MAIN event,
//   so every page that shows one event keeps working unchanged.
// - users/{uid}.extraEvents = ['ENT', 'SBEC'] lists their other events.
// - Plan progress for an extra event lives in the same maps (planChecks,
//   planLinks, planExcused) with the event code in front: "ENT__roleplay-1".
//   Making an extra event the main one swaps the prefixes (server side).
// No Firebase calls here, so pages and tests can share it.

import { EVENTS } from './events.js';

export const SEP = '__';

export const multiEventSettings = (school) => {
  const s = school?.eventSettings || {};
  return { multi: !!s.multi, max: s.max === 3 ? 3 : 2 };
};

// Every event the student has, main first.
export function studentEventCodes(profile) {
  return [profile.eventCode, ...(profile.extraEvents || []).filter((c) => c !== profile.eventCode)];
}

// The keys in a progress map that belong to one extra event, without the prefix.
export function progressFor(map = {}, code) {
  const prefix = `${code}${SEP}`;
  return Object.fromEntries(Object.entries(map || {}).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
}

// The main event's keys (anything without an event prefix).
export function mainProgress(map = {}) {
  return Object.fromEntries(Object.entries(map || {}).filter(([k]) => !/^[A-Z]+__/.test(k)));
}

// The key a task's progress is saved under for this event.
export const progressKey = (code, id, isMain) => (isMain ? id : `${code}${SEP}${id}`);

// A copy of the student shaped as if `code` were their only event: its name,
// cluster, and its own plan progress. The main event returns the student as is.
export function eventView(profile, code) {
  if (!code || code === profile.eventCode) return { ...profile, planChecks: mainProgress(profile.planChecks), planLinks: mainProgress(profile.planLinks), planExcused: mainProgress(profile.planExcused), isMainEvent: true };
  const event = EVENTS.find((e) => e.code === code);
  return {
    ...profile,
    eventCode: code,
    eventName: event?.event || code,
    cluster: event?.cluster || '',
    planChecks: progressFor(profile.planChecks, code),
    planLinks: progressFor(profile.planLinks, code),
    planExcused: progressFor(profile.planExcused, code),
    planLateHandled: !!profile.planLateHandledEvents?.[code],
    isMainEvent: false,
  };
}

// Replaces one event's keys in a progress map with `values` (unprefixed ids).
export function withProgress(map = {}, code, isMain, values = {}) {
  const kept = Object.fromEntries(Object.entries(map || {}).filter(([k]) => (isMain ? /^[A-Z]+__/.test(k) : !k.startsWith(`${code}${SEP}`))));
  const added = Object.fromEntries(Object.entries(values).map(([id, v]) => [progressKey(code, id, isMain), v]));
  return { ...kept, ...added };
}

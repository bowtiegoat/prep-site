// Which competition a student first competes at, and when. Prep timelines
// count back from this date.
//
// - Role plays always start at the school's first competition.
// - Prepared events start at district/regional, unless the school's advisor
//   says they don't compete until state/provincial (e.g. Pennsylvania).
// - With no district/regional competition, everything starts at state.
// - Virtual events (Virtual Business Challenge, Stock Market Game) run on
//   their own online schedule.

import { EVENTS } from './events.js';

export const LEVEL_LABELS = { district: 'District/Regional', state: 'State/Provincial' };

export function firstCompetition(eventCode, dates) {
  const event = EVENTS.find((e) => e.code === eventCode);
  if (!event) return null;
  if (event.type === 'Virtual') return { level: 'virtual', label: 'Online (virtual event)', date: '' };
  if (!dates || !dates.state) return null;
  const preparedAtState = dates.preparedFirstAt === 'state';
  const level = dates.noDistrict || (event.type === 'Prepared' && preparedAtState) ? 'state' : 'district';
  return { level, label: LEVEL_LABELS[level], date: dates[level] || '' };
}

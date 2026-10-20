import { EVENTS, CLUSTERS } from './events.js';
import { esc } from './app.js';

// <option>s for an event <select>, grouped by career cluster.
export function eventOptionsHtml(selected = '') {
  const groups = CLUSTERS.map((cluster) => {
    const options = EVENTS
      .filter((e) => e.cluster === cluster)
      .sort((a, b) => a.event.localeCompare(b.event))
      .map((e) => `<option value="${esc(e.code)}"${e.code === selected ? ' selected' : ''}>${esc(e.event)} (${esc(e.code)})</option>`)
      .join('');
    return `<optgroup label="${esc(cluster)}">${options}</optgroup>`;
  });
  return `<option value="">Choose your event</option>${groups.join('')}`;
}

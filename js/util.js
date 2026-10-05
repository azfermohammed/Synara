/* ============================================================
   util.js — templating, escaping, dates, formatting
   ------------------------------------------------------------
   Imported by store.js, main.js, insights.js, and every view.
   Nothing in here touches storage or the DOM tree; it is all pure
   helpers so views stay readable.
   ============================================================ */

/* ---------- HTML templating ----------------------------------

   `html` is a tagged template that escapes every interpolated
   value by default. Views build strings and hand them to the
   renderer, so this is the only thing standing between a user's
   med name and an injected <script>. Opt out deliberately with
   raw() when you are splicing in already-built markup.
--------------------------------------------------------------- */

export function esc(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const RAW = Symbol('raw');

/** Mark a string as already-safe markup so `html` won't escape it. */
export function raw(str) {
  return { [RAW]: true, value: String(str == null ? '' : str) };
}

function resolve(part) {
  // Booleans deliberately stringify to "true"/"false" rather than
  // collapsing to ''. They are almost always ARIA state here —
  // aria-selected, aria-pressed, aria-checked — and an empty string
  // is invalid for those attributes. Conditional markup uses an
  // explicit raw(cond ? x : '') rather than relying on falsiness.
  if (part == null) return '';
  if (Array.isArray(part)) return part.map(resolve).join('');
  if (typeof part === 'object' && part[RAW]) return part.value;
  return esc(part);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    out += resolve(values[i]) + strings[i + 1];
  }
  return out;
}

/** Join an array into already-built markup. */
export function map(list, fn) {
  return raw(list.map(fn).join(''));
}

/* ---------- Dates ---------------------------------------------

   Every date in this app is LOCAL and timezone-free on purpose.
   A seizure logged at 2pm is 2pm — if the student flies to another
   state, the record should not shift. So:

     day key   "YYYY-MM-DD"
     timestamp "YYYY-MM-DDTHH:mm"     (no Z, no offset)
     time      "HH:MM"                 24-hour

   Never hand these to `new Date(string)` directly: "2026-09-19"
   parses as UTC midnight and lands on the 18th in the Americas.
   parseKey/parseStamp below build the date from parts instead.
--------------------------------------------------------------- */

const pad = (n) => String(n).padStart(2, '0');

/** Date object -> "YYYY-MM-DD" */
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Date object -> "YYYY-MM-DDTHH:mm" */
export function stamp(d = new Date()) {
  return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Date object -> "HH:MM" */
export function timeOf(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM-DD" -> Date at local midnight. */
export function parseKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "YYYY-MM-DDTHH:mm" -> Date in local time. */
export function parseStamp(s) {
  const [datePart, timePart = '00:00'] = String(s).split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0);
}

/** "HH:MM" -> minutes since local midnight. */
export function minutesOf(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Shift a day key by n days (negative goes back). */
export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** Whole days between two day keys (b - a). */
export function daysBetween(a, b) {
  const ms = parseKey(b) - parseKey(a);
  return Math.round(ms / 86400000);
}

/** Array of day keys, oldest first, ending today. */
export function lastNDays(n, endKey = dayKey()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(endKey, -i));
  return out;
}

/* ---------- Human-readable formatting ------------------------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const monthName = (i) => MONTHS[i];
export const dayName = (i) => DAYS[i];

/** "08:00" -> "8:00 AM" */
export function prettyTime(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${pad(m || 0)} ${suffix}`;
}

/** "2026-09-19" -> "Sat, Sep 19", with Today/Yesterday shortcuts. */
export function prettyDate(key, { relative = true } = {}) {
  const today = dayKey();
  if (relative) {
    if (key === today) return 'Today';
    if (key === addDays(today, -1)) return 'Yesterday';
    if (key === addDays(today, 1)) return 'Tomorrow';
  }
  const d = parseKey(key);
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Minutes -> "2h 15m", "45m", "now". */
export function prettyDuration(mins) {
  const m = Math.max(0, Math.round(mins));
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

/** Seconds -> "1 min 45 sec" for seizure durations. */
export function prettySeconds(secs) {
  const s = Math.max(0, Math.round(secs));
  if (s < 60) return `${s} sec`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m} min ${rest} sec` : `${m} min`;
}

/** "2026-09-19T14:30" -> "Today at 2:30 PM" */
export function prettyStamp(s) {
  const [datePart, timePart] = String(s).split('T');
  return `${prettyDate(datePart)} at ${prettyTime(timePart || '00:00')}`;
}

/** Rough "3 days ago" for history lists. */
export function timeAgo(s) {
  const then = parseStamp(s);
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}

/* ---------- Misc ---------------------------------------------- */

/** Short unique id. Not cryptographic — just needs to not collide. */
export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Turn "(555) 010-2244" into something tel: accepts. */
export function telHref(phone) {
  return `tel:${String(phone).replace(/[^\d+]/g, '')}`;
}

/** True when a number has enough digits to actually dial. An emergency
    button that rings nothing is worse than no button. */
export function dialable(phone) {
  return (String(phone || '').match(/\d/g) || []).length >= 3;
}

/** Initials for the avatar, max two letters. */
export function initials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();
}

/** Tally an array into [{value, count}], most frequent first. */
export function tally(list) {
  const counts = new Map();
  for (const item of list) {
    if (item == null || item === '') continue;
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

/** Pluralise: plural(1,'seizure') -> "1 seizure" */
export function plural(n, word, suffix = 's') {
  return `${n} ${word}${n === 1 ? '' : suffix}`;
}

/**
 * Label for one of today's doses.
 *
 * "Due now" for everything in the past is technically true and
 * practically useless — a dose thirteen hours late should say so,
 * because that is the one worth chasing.
 */
export function doseLabel(status, time) {
  if (status === 'taken') return 'Taken';
  if (status === 'late') return 'Taken late';
  if (status === 'missed') return 'Missed';

  const late = minutesOf(timeOf()) - minutesOf(time);
  if (late < 0) return 'Scheduled';
  if (late <= 60) return 'Due now';
  return `${prettyDuration(late)} overdue`;
}

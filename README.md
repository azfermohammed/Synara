# Synara

Medication reminders, seizure tracking, and an emergency safety card in one
app, built around school life rather than a clinic.

This is the real app, not the pitch demo. The original clickable prototype is
kept in [`prototype/`](prototype/) for reference.

---

## Run it

It's a static site with no build step and no dependencies:

```bash
python3 -m http.server 4173
# then open http://localhost:4173
```

It must be **served over http**, not opened as a file — ES modules and the
service worker both need a real origin.

To deploy, upload the folder as-is to Netlify, Vercel, GitHub Pages, or any
static host. There is nothing to compile.

### First run

Synara asks once, before writing anything to storage:

- **Set it up for me** — starts empty and drops you on Meds to add your first
  medication.
- **Look around with example data** — loads a full synthetic record (45 days of
  doses, four seizures, five contacts) so every screen is populated.

The demo record is genuinely useful for showing the app to someone, but it is
*somebody else's medical history*. A real student has to be able to decline it
rather than open the app and find it already filled in. Nothing is persisted
until the choice is made, so closing the tab re-asks rather than silently
committing an empty record.

Standard seizure first aid **is** pre-filled either way — it's the same for
everyone, it isn't personal data, and an emergency card that renders as empty
headings is worse than useless in the moment it's needed. Only the genuinely
personal fields start blank: what the seizures look like, the notes for staff,
and the contacts.

---

## What's in it

| Screen | What it does |
| --- | --- |
| **Home** | Live countdown to the next dose, today's doses, 30-day adherence, days since the last seizure, and the single strongest pattern found in your data |
| **Meds** | Add/edit medications with any number of daily times. Tap a circle to cycle taken → late → missed → not logged. Four-week calendar with seizure days ringed |
| **Seizures** | Ten-second logging form, full history, daily sleep/stress check-in, and the **Patterns** tab |
| **Safety** | The seizure card: contacts, what the seizures look like, first aid, when to call 911, and separate instructions for teachers, the nurse, and coaches |
| **You** | Care details, reminders, theme, and data export/reset |

**SOS sits in the app bar on every single screen.** That is the whole design
answer to "there should be a way to pull it up SUPER quickly" — one tap, from
anywhere, into a full-screen card a panicking teacher can follow. It keeps the
screen awake while it's open.

---

## The Patterns engine is real

`js/insights.js` computes everything from what's actually logged. It is not
fed conclusions. It looks for:

- seizures within 48h of a missed or late dose
- sleep on the nights before seizures vs. every other night
- stress on seizure days vs. other days
- most common trigger, time-of-day clustering, most common location
- whether adherence is improving or slipping
- whether seizures are getting more or less frequent

Three rules it follows, because this is the part most likely to be believed:

1. **It returns nothing rather than inventing a pattern.** Every check has a
   minimum-data threshold and a minimum effect size. An empty Patterns screen
   is a correct answer.
2. **It shows the evidence, not just the conclusion.** Every insight carries
   the counts it came from — "3/4 seizures · 75%" is checkable.
3. **It says "associated with", never "caused by",** and prints a standing
   disclaimer under the results.

Change the demo data and the numbers change with it. Nothing is hardcoded.

---

## Architecture

```
index.html                 shell; loads CSS, boots js/main.js
manifest.webmanifest       PWA metadata, install shortcuts
sw.js                      offline cache
css/
  tokens.css               palette, type, spacing, dark mode, motion limits
  base.css                 reset, typography, print rules
  components.css           buttons, cards, forms, sheets, toasts
  app.css                  shell, nav, and per-screen styles
js/
  main.js                  boot, hash routing, render loop, action dispatch
  store.js                 state + persistence  <- the only file that knows where data lives
  util.js                  html templating with auto-escaping, dates, formatting
  ui.js                    sheets, toasts, the emergency overlay, icons
  insights.js              the pattern engine
  notify.js                dose reminders
  seed.js                  synthetic demo data
  views/                   home, meds, seizures, safety, profile
```

**Rendering** is deliberately simple: views are pure functions from state to an
HTML string, and any store change re-renders the current screen. At this size
it's fast, and it removes the class of bug where the UI and the data drift
apart.

**Actions** are declared as `data-action="..."` in markup. Each view exports an
`actions` map; `main.js` merges them and runs one delegated click listener.

**Escaping**: `util.js` exports an `html` tagged template that escapes every
interpolated value. Anything that is already markup has to be wrapped in
`raw()` — that asymmetry is deliberate, so the default is safe.

### Adding cloud sync later

`js/store.js` is the only seam you need. Every function in it is already
`async` even though `localStorage` is synchronous — that was the point. To move
to a server:

```js
const supabaseBackend = {
  name: 'supabase',
  async read()       { /* select */ },
  async write(state) { /* upsert */ },
  async clear()      { /* delete */ },
};
store.setBackend(supabaseBackend);
```

Nothing else in the app changes. No call site goes from sync to async, because
none of them were ever sync.

---

## Data

One object under the `synara.v2` localStorage key:

```js
{
  profile:  { name, pronouns, grade, school, seizureType, diagnosed,
              neurologist, neuroPhone, allergies, bloodType },
  meds:     [{ id, name, dose, form, times: ["08:00","20:00"], notes, color, active }],
  doses:    { "2026-09-19": { "med_abc|08:00": { status: "taken", at: "2026-09-19T08:12" } } },
  seizures: [{ id, at: "2026-09-16T15:40", duration, type, trigger, place,
               aura, injury, emsCalled, notes }],
  checkins: { "2026-09-19": { sleepHours: 7.5, sleepQuality, stress: 2, mood, notes } },
  contacts: [{ id, name, relation, phone, primary }],
  card:     { looksLike, during[], doNot[], after[], callEms[],
              forTeacher, forNurse, forCoach, updated },
  settings: { theme, remindersOn, reminderLead, quietHours, seeded }
}
```

Dose status is one of `pending | taken | late | missed`.

**Dates are local and timezone-free on purpose.** Day keys are `YYYY-MM-DD`,
timestamps are `YYYY-MM-DDTHH:mm` with no offset. A seizure logged at 2pm stays
2pm even if the student flies to another state. Never pass these to
`new Date(string)` — `"2026-09-19"` parses as UTC midnight and lands on the
18th in the Americas. Use `parseKey` / `parseStamp` from `util.js`.

---

## Design decisions worth knowing

**Purple** because it's the epilepsy awareness colour.

**Nothing flashes, strobes, or flickers.** Some people with epilepsy are
photosensitive. All motion runs through two variables in `tokens.css` and
collapses to zero under `prefers-reduced-motion`. Treat that as a hard rule.

**Dark mode is not decoration.** This app gets opened at 3am to log a seizure
that just woke someone. A full-white screen at that moment is hostile.

**Dose status never relies on colour alone** — every state has a distinct glyph
and a text label, so it survives colour blindness and a greyscale print.

**Unlogged past doses count as missed in the statistics** but display as "Due"
or "12h overdue" for today. Adherence is the one number that must not quietly
round itself up. The calendar makes the opposite call and leaves today neutral
until the day is over — statistics and encouragement have different jobs.

**Deleting a medication leaves its dose history intact.** Deleting something
today should not rewrite the past; a neurologist may still ask about it.

---

## Honest limitations

**Dose reminders are not dependable on the web.** A website can only fire a
notification while it's open in a tab. Close the browser or restart the phone
and the reminder is gone. On iPhone, notifications only work at all once the
app is added to the home screen. The app says this plainly in Settings rather
than implying a guarantee it can't keep — but it's the single strongest
argument for rebuilding in **React Native + Expo**, which gets real local
notifications and a lock-screen shortcut to the safety card.

**Data lives only in this browser.** Clearing browser data deletes it, and it
doesn't follow you to another phone. Export a copy periodically.

**Cloud sync is deliberately not built.** The moment health data syncs to a
server or a parent's phone, HIPAA, COPPA, and school-district rules all apply.
That's a real conversation to have before writing the code, not after.

**This is a student project, not a medical device.** The first-aid content
follows standard public seizure first aid, but any real student's card should
be confirmed with their neurologist and school nurse.

All demo data is synthetic — invented names, a fictional school, and 555 phone
numbers, which are reserved for fiction. No real health information is in this
repository.

---

## Working on it

The service worker caches aggressively, which is right in production and
annoying in development. If an edit doesn't show up, clear it:

```js
navigator.serviceWorker.getRegistrations().then(r => r.forEach(x => x.unregister()));
caches.keys().then(k => k.forEach(n => caches.delete(n)));
```

then hard-reload. Bump `VERSION` in `sw.js` when you deploy.

To reset the demo data, use **You → Reset to example data**, or
`localStorage.removeItem('synara.v2')`.

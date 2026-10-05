# Synara

Medication reminders, seizure tracking, and an emergency safety card in one
app — built around school life rather than a clinic.

A static progressive web app: no build step, no dependencies, no server, no
account. The original clickable pitch prototype is kept in
[`prototype/`](prototype/).

---

## Run it

```bash
python3 dev.py          # or: npm run dev
# open http://localhost:4173
```

`dev.py` is `python3 -m http.server` plus a `Cache-Control: no-cache` header
(see [Working on it](#working-on-it) for why that matters). The app must be
served over http — ES modules and the service worker both need a real origin,
so opening `index.html` as a file won't work.

```bash
npm test                # 28 tests, Node's built-in runner, no installs
```

### Deploy

Upload the folder as-is to any static host. There is nothing to compile.
`vercel.json` (Vercel) and `_headers` (Netlify, Cloudflare Pages) set the
caching headers the app relies on; on other hosts, make sure `.js`, `.css`,
and `.html` are served with `Cache-Control: no-cache`.

### Synara in Flux

Synara is also one of the apps in [Flux](https://github.com/fluxplanner/Flux),
as `synara.html` beside the Grapher and Pixel: it's on the Flux hub and in the
Flux app switcher, but keeps its own name, violet look, and light/dark theme.
This repo stays the source. To update Flux:

```bash
npm run flux -- "../dev/Flux Planner"     # copies js/, css/, icons/ to public/synara/
cd "../dev/Flux Planner" && npm run build:web
```

Flux's build bundles the modules into one hashed script and stylesheet, so a
returning visitor can never get a new `main.js` with an old `store.js`. Inside
Flux, `<html data-host="flux">` tells `main.js` to skip its own service worker
(Flux's covers the page) and to put Flux's switcher in the app bar.

---

## First run

Synara asks once, before writing anything to storage:

- **Set it up for me** — starts empty and drops you on Meds to add your first
  medication.
- **Look around with example data** — loads a synthetic record (45 days of
  doses, four seizures, five contacts, a stopped medication, a schedule
  change) so every screen is populated.

The example record is useful for showing the app to someone, but it is
*somebody else's medical history* — a real student has to be able to decline
it rather than open the app and find it already filled in.

Standard seizure first aid **is** pre-filled either way: it's the same for
everyone, it isn't personal data, and an emergency card that renders as empty
headings would be worse than useless in the moment it's needed. Only the
genuinely personal parts start blank, and the Safety tab lists what's missing.

---

## What's in it

| Screen | What it does |
| --- | --- |
| **Home** | The next dose with one-tap logging, today's doses, 30-day adherence, days since the last seizure, a streak, and the strongest pattern in your log |
| **Meds** | Medications with any number of daily times; tap a circle to cycle taken → late → missed → not logged; a four-week calendar with seizure days ringed (tap a day to back-fill it); stopped medications kept with their history |
| **Seizures** | A forgiving log form, history grouped by month, a ten-second daily sleep/stress check-in, and **Patterns** |
| **Safety** | The seizure card — contacts, what the seizures look like, first aid, when to call 911, medical details, and notes for teachers, the nurse, and coaches — plus **Print for school** |
| **You** | Care details, reminders, theme, and full control of the data: back up, restore, load example data, delete everything |

### Emergency mode

**SOS sits in the app bar on every screen.** One tap from anywhere opens a
full-screen card a panicking teacher can follow, and keeps the screen awake.

It has a **seizure timer**, because the card's first instruction is "start
timing" and five minutes is the line for calling 911:

- **Start** the moment the seizure begins. It counts up; screen readers hear
  each whole minute.
- **At 5:00** the timer switches once to a solid red "Call 911 now" state with
  the 911 button inside it. Nothing blinks or flashes — ever.
- **It stopped** shows how long it lasted and offers **Log this seizure** with
  the start time and duration already filled in.
- The start time is kept for the session, so closing the card by accident or
  reloading doesn't lose the count.

The big green button calls the first-call contact — or, if that contact has no
usable number, the first one who does. A button that rings nothing is worse
than no button.

**Shortcut:** long-press the installed app's icon → **Emergency card**, or open
`/#/sos`, to land straight in emergency mode.

### Printable card

**Safety → Print for school** produces a one-page seizure action card for the
front office binder or a locker door: name, seizure type, medications,
allergies, what it looks like, what to do and not do, when to call 911, who to
call, and the role-specific notes. It's designed to survive a black-and-white
printer — every warning is carried by words and borders, not colour.

---

## The Patterns engine is real

`js/insights.js` computes everything from what's actually logged. It looks for:

- seizures within 48 hours of a missed or late dose
- sleep on the nights before seizures vs. every other night
- stress on seizure days vs. other days
- the most common trigger, time of day, and place
- whether adherence or seizure frequency is changing

Three rules, because this is the part most likely to be believed:

1. **It returns nothing rather than inventing a pattern.** Every check has a
   minimum amount of data and a minimum effect size.
2. **It shows its evidence.** "3/4 seizures · 75%" is checkable; "you often
   have seizures after missed doses" isn't.
3. **It says "associated with", never "caused by",** with a standing
   disclaimer under the results.

The example data deliberately has one seizure that *doesn't* follow a missed
dose, so the engine reports 3 of 4, not a suspiciously perfect 100%.

---

## Medication history

Each medication records *when* it was taken on *which* schedule, not just its
current times:

```js
{ id, name, dose, form, notes, color,
  added:    "2026-08-21",            // first day tracked
  ended:    null,                    // first day no longer tracked
  schedule: [
    { from: "2026-08-21", times: ["08:00", "21:00"] },
    { from: "2026-09-14", times: ["08:00", "20:00"] }   // evening dose moved
  ] }
```

Without this, the first build rewrote the past. Adding a medication today
marked every earlier day as missed — 0% adherence on day one. Moving the 8pm
dose to 9pm re-read the whole month at 9pm, and adherence fell from 79% to 56%.
Deleting a medication erased its doses from every statistic.

Now:

- statistics count only what was actually scheduled on each day
  (`store.dosesOn(day)`)
- changing times starts a new schedule entry from today
- **Stop taking** ends a medication but keeps its history
- **Restart** reopens it with an honest gap rather than a run of "missed"

All three of the original bugs are regression tests in `test/store.test.js`.

---

## Architecture

```
index.html               shell; loads CSS, boots js/main.js
manifest.webmanifest     PWA metadata and home-screen shortcuts
sw.js                    offline support (network first, cache fallback)
dev.py                   local server with revalidation headers
vercel.json, _headers    the same headers for Vercel / Netlify
css/
  tokens.css             palette, type, spacing, dark mode, motion limits
  base.css               reset, typography, utilities
  components.css         buttons, cards, forms, sheets, lists, toasts
  app.css                shell, navigation, every screen, emergency mode
  print.css              the printed safety card (media="print" only)
js/
  main.js                boot, routing, render loop, action dispatch
  store.js               state, persistence, validation  ← the only file that knows where data lives
  insights.js            the pattern engine and headline numbers
  util.js                escaped HTML templating, dates, formatting
  ui.js                  icons, sheets, toasts, overlays, focus
  notify.js              dose reminders
  seed.js                synthetic example data
  views/                 home, meds, seizures, safety, profile
test/                    node:test suites for store, insights, util
```

**Rendering** is deliberately simple: views are pure functions from state to an
HTML string, and every change re-renders the current screen, so the UI can't
drift from the data. The two usual costs of that are paid back explicitly:
scroll position and keyboard focus are restored after every render.

**Escaping:** `util.js`'s `html` template escapes every interpolated value;
anything that's already markup must be wrapped in `raw()`. Safe by default.

**Accessibility:** while a sheet or the emergency card is open, the app behind
it is `inert`; focus returns to the control that opened it; status never
relies on colour alone; the primary touch targets — dose circles, tabs, SOS,
and the emergency buttons — are 44px or larger.

### Adding cloud sync later

`js/store.js` is the only seam. Everything in it is already `async` even
though `localStorage` is synchronous — that was the point:

```js
store.setBackend({
  name: 'supabase',
  async read()       { /* select */ },
  async write(state) { /* upsert */ },
  async clear()      { /* delete */ },
});
```

No call site has to change. Every load still goes through `migrate()`, so
server data gets the same validation as everything else.

---

## Data

One object under the `synara.v2` localStorage key (schema version 3):

```js
{
  v: 3,
  profile:  { name, pronouns, grade, school, seizureType, diagnosed,
              neurologist, neuroPhone, allergies, bloodType },
  meds:     [ /* see Medication history */ ],
  doses:    { "2026-10-05": { "med_abc|08:00": { status: "taken", at: "2026-10-05T08:12" } } },
  seizures: [{ id, at: "2026-10-02T15:40", duration /* seconds */, type, trigger,
               place, aura, injury, emsCalled, notes }],
  checkins: { "2026-10-05": { sleepHours: 7.5, sleepQuality, stress: 2, mood, notes } },
  contacts: [{ id, name, relation, phone, primary }],
  card:     { looksLike, during[], doNot[], after[], callEms[],
              forTeacher, forNurse, forCoach, updated },
  settings: { theme, remindersOn, reminderLead, quietHours, seeded }
}
```

Dose status is `taken | late | missed`; absence means not logged. Older saved
records are migrated automatically.

**Dates are local and timezone-free on purpose.** Day keys are `YYYY-MM-DD`
and timestamps `YYYY-MM-DDTHH:mm`, with no offset — a seizure logged at 2pm
stays 2pm if the student travels. Never pass these to `new Date(string)`
(`"2026-03-08"` parses as UTC midnight, the 7th in the Americas); use
`parseKey` / `parseStamp` from `util.js`.

**Every load is validated.** Backups can be restored, so stored data can come
from a file somebody else made. `store.migrate()` checks every id, date, time,
and status against a strict format before anything reaches the screen; a
deliberately malicious backup is a test case. And nothing can be written until
the stored record has been read, so a failed start can never save an empty
record over a real one.

---

## Design decisions worth knowing

**Purple** because it's the epilepsy awareness colour.

**Nothing flashes, strobes, or flickers.** Some people with epilepsy are
photosensitive. All motion runs through two variables in `tokens.css`,
collapses to zero under `prefers-reduced-motion`, and the emergency timer
changes state exactly once. Treat this as a hard rule.

**Dark mode is not decoration.** This app gets opened at 3am to log a seizure
that just woke someone.

**Unlogged past doses count as missed in the statistics** — adherence is the
one number that must not quietly round itself up — but today gets an hour of
grace, and the calendar leaves today neutral until the day is over.

**Icons are inline SVG, not emoji,** so the app looks the same on every phone
a teacher might be holding.

---

## Honest limitations

**Dose reminders are not dependable on the web.** A website can only send a
notification while it's running; close the browser or restart the phone and
the reminder is gone. On iPhone, notifications need the app added to the home
screen first. The app says this plainly in Settings — and it's the strongest
argument for building the next version in **React Native + Expo**, which gets
real local notifications and a lock-screen shortcut to the safety card.

**Data lives only on this device.** Clearing browser data deletes it, and it
won't move to a new phone on its own — use **You → Download a backup**.

**Cloud sync is deliberately not built.** Once health data syncs to a server or
a parent's phone, HIPAA, COPPA, and school-district rules all apply. That
conversation comes before the code.

**This is a student project, not a medical device.** The first-aid content
follows standard public seizure first aid; any real student's card should be
confirmed with their neurologist and school nurse.

All example data is synthetic — invented names, a fictional school, and 555
phone numbers, which are reserved for fiction.

---

## Working on it

**Use `dev.py`, not plain `http.server`.** Plain `http.server` sends no caching
headers, so browsers guess: a file last changed two weeks ago is treated as
fresh for about a day and a half. After an edit, the browser can then load a
new module next to an old one it never re-requested, and the app fails to
start with `does not provide an export named …`. `dev.py`, `vercel.json`, and
`_headers` all send `Cache-Control: no-cache`, which makes the browser check
first (a cheap 304 when nothing changed).

**The service worker is network-first** and revalidates every request, so an
online user always gets one consistent, current version, and an offline user
gets the last version they loaded. No manual cache clearing is needed. Bump
`VERSION` in `sw.js` when the precache list changes.

**Reset during development:** You → **Load example data** or **Delete
everything**.

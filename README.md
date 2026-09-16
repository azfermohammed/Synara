# Synara — clickable prototype

A working demo of the epilepsy app for students: medication reminders, seizure
tracking, and an emergency safety card in one place.

Not a mockup — the buttons work, the data persists, and the pattern insights are
computed from the logged data rather than written in by hand.

## Open it

Double-click `index.html`. That's it — no install, no build step, no server.

To share a link instead, drag this folder onto [netlify.com/drop](https://app.netlify.com/drop)
or run `npx vercel` in it. Both are free and take about a minute.

## What to click

| Screen | What works |
| --- | --- |
| **Home** | Next-dose countdown that ticks in real time; mark taken/skipped; live stats |
| **Meds** | Tap any circle to cycle taken → late → missed; add/edit/delete meds and their times; 4-week adherence calendar with seizure days ringed |
| **Seizures** | Full log form; history; **Patterns** computed live from the data |
| **Safety** | The seizure card; tap **SOS** (top-right of any screen) for the full-screen version |
| **You** | Edit care details; reset the demo |

The **SOS** button sits in the app bar on every screen on purpose — the whole
point of a safety card is that nobody has to go hunting for it mid-seizure.

### The Patterns section is real

It reads the actual logs, so it changes as you use the demo:

- seizures that followed a missed or late dose within 48h
- most common trigger, and how often
- time-of-day clustering in 4-hour blocks
- most common location
- adherence trend, last 14 days vs. last 45

With fewer than two seizures logged it shows nothing rather than inventing a
pattern. Log a couple of entries and watch the numbers move.

## Answering "what platform/language?"

**This prototype** is plain HTML + CSS + JavaScript. No frameworks, no build,
no server. It runs on any phone or laptop browser today.

**For the real app**, the shortest path is **React Native + Expo** — one
JavaScript codebase shipping to both iOS and Android. It's the same language
this prototype is written in, so none of the thinking here is wasted.

The two things that genuinely need a native app rather than a website:

1. **Push notifications** for dose reminders. Web notifications are unreliable
   on iOS and don't fire when the browser is closed — fatal for a med reminder.
2. **A lock-screen / widget shortcut** to the safety card, so it opens without
   unlocking the phone.

Everything else in this prototype ports over more or less directly.

## Suggested v1 scope

Matches what Ananya described — ship these three, then add:

1. Medication list + reminders + taken/missed/late logging with history
2. Seizure logging + history
3. Emergency safety card

Deliberately **later**: accounts, cloud sync, parent/nurse logins, doctor PDF
export, pattern insights. The insights in this demo are a preview of where it
goes, not v1.

## Before this touches a real student's data

Worth flagging early, because it shapes the architecture:

- Right now everything lives in `localStorage` on the device. Nothing is sent
  anywhere, which is the most private option and fine for a prototype.
- The moment health data syncs to a server or a parent's phone, HIPAA/COPPA and
  school-district rules come into play. That's a real conversation, not a
  checkbox — worth having before building accounts.
- The first-aid steps here follow standard public seizure-first-aid guidance,
  but any real student's card should be confirmed with their neurologist. The
  app should make that explicit.

This is a design prototype, not a medical device.

## Files

```
index.html    markup + the pitch panel shown beside the phone on desktop
styles.css    all styling; design tokens are the :root variables at the top
app.js        state, storage, the five screens, and the insight engine
```

State is one object under the `synara.v1` localStorage key. "Reset demo data"
(bottom of the **You** tab) restores the seeded version, which is generated
relative to today's date so the demo never looks stale.

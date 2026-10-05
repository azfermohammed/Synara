/* ============================================================
   Synara — prototype app logic
   Plain JS, no dependencies. State lives in localStorage so the
   demo survives a refresh; "Reset demo data" puts it back.
   ============================================================ */

(function () {
  'use strict';

  var KEY = 'synara.v1';

  /* ---------------- date + format helpers ---------------- */

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function dateKey(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function todayKey() { return dateKey(new Date()); }

  function addDays(d, n) {
    var c = new Date(d.getTime());
    c.setDate(c.getDate() + n);
    return c;
  }

  // "2026-09-15" -> Date at local midnight (avoids the UTC-parse off-by-one)
  function parseKey(k) {
    var p = k.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  // "2026-09-15T14:20" -> local Date
  function parseStamp(s) {
    var half = s.split('T');
    var d = parseKey(half[0]);
    var t = (half[1] || '00:00').split(':');
    d.setHours(+t[0], +t[1], 0, 0);
    return d;
  }

  function stampOf(d) { return dateKey(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  // "08:00" -> "8:00 AM"
  function fmtTime(hhmm) {
    var p = hhmm.split(':');
    var h = +p[0], m = p[1];
    var ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + m + ' ' + ap;
  }

  function minutesOf(hhmm) {
    var p = hhmm.split(':');
    return (+p[0]) * 60 + (+p[1]);
  }

  function nowMinutes() {
    var d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  function fmtGap(mins) {
    mins = Math.abs(Math.round(mins));
    if (mins < 60) return mins + 'm';
    var h = Math.floor(mins / 60), m = mins % 60;
    return m ? h + 'h ' + m + 'm' : h + 'h';
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function relDay(k) {
    var t = todayKey();
    if (k === t) return 'Today';
    if (k === dateKey(addDays(new Date(), -1))) return 'Yesterday';
    var d = parseKey(k);
    var diff = Math.round((parseKey(t) - d) / 86400000);
    if (diff > 0 && diff < 7) return DAYS[d.getDay()];
    return MONTHS[d.getMonth()] + ' ' + d.getDate();
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function uid() { return Math.random().toString(36).slice(2, 10); }

  function setT(d, h, m) {
    var c = new Date(d.getTime());
    c.setHours(h, m, 0, 0);
    return c;
  }

  /* ---------------- seed data ---------------- */

  // Seeded relative to today so the demo always looks current.
  // The missed doses below sit 1-2 days before three of the four
  // seizures on purpose: the insight engine finds that correlation
  // by actually reading the data, not by hardcoding the sentence.
  function seed() {
    var today = new Date();
    var s = {
      profile: {
        name: 'Ananya R.',
        grade: '11th grade',
        school: 'Westfield High',
        seizureType: 'Focal aware seizures',
        diagnosed: '2023',
        neurologist: 'Dr. Osei — Westfield Neurology',
        allergies: 'Penicillin'
      },
      meds: [
        { id: 'm1', name: 'Levetiracetam', dose: '500 mg', note: 'Keppra', times: ['08:00', '20:00'], icon: '💊' },
        { id: 'm2', name: 'Lamotrigine', dose: '100 mg', note: 'Lamictal', times: ['21:00'], icon: '🟣' },
        { id: 'm3', name: 'Folic acid', dose: '1 mg', note: 'with breakfast', times: ['08:00'], icon: '🟡' }
      ],
      doseLog: {},
      seizures: [
        {
          id: 's1', at: stampOf(setT(addDays(today, -3), 14, 20)),
          duration: 45, type: 'Focal aware', trigger: 'Missed sleep',
          place: 'School — 4th period', notes: 'Stared out, right hand tapping. Nurse timed it. Sat in the health office for 20 min after.'
        },
        {
          id: 's2', at: stampOf(setT(addDays(today, -11), 7, 45)),
          duration: 30, type: 'Focal aware', trigger: 'Missed dose',
          place: 'Home — kitchen', notes: 'Right before the bus. Mom kept me home first period.'
        },
        {
          id: 's3', at: stampOf(setT(addDays(today, -24), 15, 10)),
          duration: 60, type: 'Focal impaired', trigger: 'Stress',
          place: 'School — hallway', notes: 'Day of the chem test. Didn\'t remember the minute after.'
        },
        {
          id: 's4', at: stampOf(setT(addDays(today, -38), 14, 55)),
          duration: 40, type: 'Focal aware', trigger: 'Missed sleep',
          place: 'School — library', notes: 'Slept about 4 hours the night before.'
        }
      ],
      contacts: [
        { id: 'c1', name: 'Priya R.', relation: 'Mom', phone: '(555) 014-2288', primary: true },
        { id: 'c2', name: 'Arjun R.', relation: 'Dad', phone: '(555) 014-7130', primary: false },
        { id: 'c3', name: 'Nurse Delgado', relation: 'School nurse', phone: '(555) 220-9040', primary: false },
        { id: 'c4', name: 'Dr. Osei', relation: 'Neurologist', phone: '(555) 661-3020', primary: false }
      ],
      card: {
        looksLike: 'I usually go quiet and stare, and my right hand may repeat a small movement. I can hear you but I can\'t answer for about 30–60 seconds. Afterward I\'m confused and very tired for 10–20 minutes.',
        firstAid: [
          'Stay with me and start timing the seizure.',
          'Move hard or sharp things out of the way.',
          'If I\'m on the ground, turn me on my side with something soft under my head.',
          'Loosen anything tight around my neck.',
          'Do NOT hold me down, and do NOT put anything in my mouth.',
          'Talk to me calmly as I come around — I may not answer right away.'
        ],
        callEms: [
          'The seizure lasts longer than <b>5 minutes</b>',
          'A second seizure starts right after the first',
          'I don\'t wake up or breathe normally once it stops',
          'I\'m injured, or it happened in water',
          'It looks clearly different from my usual seizures'
        ],
        instructions: 'Please let me rest somewhere quiet afterward instead of sending me straight back to class, and text my mom. I don\'t need an ambulance unless one of the things above happens.'
      }
    };

    // 45 days of dose history: mostly taken, with deliberate gaps.
    // day 41 is deliberately not near any seizure — real logs are messy,
    // and "3 of 4" reads as a finding where "4 of 4" reads as a mockup
    var missedDays = [4, 12, 25, 26, 41];   // evening doses skipped
    var lateDays = [2, 6, 9, 17, 22, 31];   // taken late
    for (var i = 45; i >= 0; i--) {
      var k = dateKey(addDays(today, -i));
      var day = {};
      s.meds.forEach(function (m) {
        m.times.forEach(function (t) {
          // don't pre-fill doses that haven't come due yet today
          if (i === 0 && minutesOf(t) > nowMinutes() - 20) return;
          var status = 'taken';
          if (missedDays.indexOf(i) !== -1 && minutesOf(t) >= 1200) status = 'missed';
          else if (lateDays.indexOf(i) !== -1 && minutesOf(t) >= 1200) status = 'late';
          day[m.id + '|' + t] = status;
        });
      });
      s.doseLog[k] = day;
    }
    return s;
  }

  /* ---------------- state ---------------- */

  var state;

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { state = JSON.parse(raw); return; }
    } catch (e) { /* corrupted or blocked storage: fall through to seed */ }
    state = seed();
    save();
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { /* private mode — demo still works, just won't persist */ }
  }

  /* ---------------- dose model ---------------- */

  // Every scheduled dose on a given day, sorted by clock time.
  function slotsFor() {
    var out = [];
    state.meds.forEach(function (m) {
      m.times.forEach(function (t) {
        out.push({ medId: m.id, med: m, time: t, slot: m.id + '|' + t });
      });
    });
    out.sort(function (a, b) { return minutesOf(a.time) - minutesOf(b.time); });
    return out;
  }

  function statusOf(key, slot) {
    var d = state.doseLog[key];
    return (d && d[slot]) || 'pending';
  }

  function setStatus(key, slot, status) {
    if (!state.doseLog[key]) state.doseLog[key] = {};
    if (status === 'pending') delete state.doseLog[key][slot];
    else state.doseLog[key][slot] = status;
    save();
  }

  // For history and stats, an unlogged dose in the past counts as missed.
  function effectiveStatus(key, slot, time) {
    var st = statusOf(key, slot);
    if (st !== 'pending') return st;
    var t = todayKey();
    if (key < t) return 'missed';
    if (key === t && minutesOf(time) < nowMinutes() - 120) return 'missed';
    return 'pending';
  }

  function nextDose() {
    var t = todayKey();
    var slots = slotsFor();
    for (var i = 0; i < slots.length; i++) {
      if (statusOf(t, slots[i].slot) === 'pending') {
        return { key: t, slot: slots[i], overdue: minutesOf(slots[i].time) < nowMinutes() };
      }
    }
    var tomorrow = slotsFor();
    return tomorrow.length
      ? { key: dateKey(addDays(new Date(), 1)), slot: tomorrow[0], tomorrow: true }
      : null;
  }

  function adherence(days) {
    var taken = 0, total = 0;
    for (var i = 0; i < days; i++) {
      var k = dateKey(addDays(new Date(), -i));
      slotsFor().forEach(function (s) {
        var st = effectiveStatus(k, s.slot, s.time);
        if (st === 'pending') return;
        total++;
        if (st === 'taken' || st === 'late') taken++;
      });
    }
    return total ? Math.round((taken / total) * 100) : 100;
  }

  function daysSinceSeizure() {
    if (!state.seizures.length) return null;
    var latest = state.seizures.map(function (s) { return parseStamp(s.at); })
      .sort(function (a, b) { return b - a; })[0];
    var t = new Date(); t.setHours(0, 0, 0, 0);
    var l = new Date(latest.getTime()); l.setHours(0, 0, 0, 0);
    return Math.round((t - l) / 86400000);
  }

  /* ---------------- insights ---------------- */
  // Everything here is computed from the logged data. With too little
  // data it returns nothing rather than inventing a pattern.

  function insights() {
    var out = [];
    var sz = state.seizures.slice().sort(function (a, b) { return parseStamp(b.at) - parseStamp(a.at); });
    if (sz.length < 2) return out;

    // 1. seizures preceded by a missed or late dose within 48h
    var near = 0;
    sz.forEach(function (s) {
      var at = parseStamp(s.at);
      var found = false;
      for (var back = 0; back <= 2 && !found; back++) {
        var k = dateKey(addDays(at, -back));
        var slots = slotsFor();
        for (var i = 0; i < slots.length; i++) {
          var st = effectiveStatus(k, slots[i].slot, slots[i].time);
          if (st !== 'missed' && st !== 'late') continue;
          var doseAt = parseKey(k);
          doseAt.setMinutes(minutesOf(slots[i].time));
          if (doseAt <= at && (at - doseAt) <= 48 * 3600000) { near++; found = true; break; }
        }
      }
    });
    if (near >= 2) {
      out.push({
        icon: '⚠️', tone: 'amber',
        title: near + ' of your ' + sz.length + ' seizures followed a missed or late dose',
        body: 'Within 48 hours. That is the strongest signal in your log right now — worth raising at your next appointment.'
      });
    }

    // 2. most common trigger
    var trig = tally(sz.map(function (s) { return s.trigger; }));
    if (trig.top && trig.count >= 2) {
      out.push({
        icon: '🔁', tone: 'violet',
        title: 'Most common trigger: ' + esc(trig.top),
        body: 'Logged on ' + trig.count + ' of ' + sz.length + ' seizures.'
      });
    }

    // 3. time-of-day clustering, in 4-hour blocks
    var blocks = {};
    sz.forEach(function (s) {
      var b = Math.floor(parseStamp(s.at).getHours() / 4);
      blocks[b] = (blocks[b] || 0) + 1;
    });
    var bestB = null, bestN = 0;
    Object.keys(blocks).forEach(function (b) { if (blocks[b] > bestN) { bestN = blocks[b]; bestB = +b; } });
    if (bestN >= 2) {
      var from = bestB * 4, to = (from + 4) % 24;
      out.push({
        icon: '🕑', tone: 'violet',
        title: bestN + ' of ' + sz.length + ' happened between ' + fmtTime(pad(from) + ':00') + ' and ' + fmtTime(pad(to) + ':00'),
        body: 'A consistent window is useful information for your neurologist.'
      });
    }

    // 4. most common place
    var pl = tally(sz.map(function (s) { return (s.place || '').split('—')[0].trim(); }));
    if (pl.top && pl.count >= 2) {
      out.push({
        icon: '📍', tone: 'mint',
        title: 'Most often at: ' + esc(pl.top),
        body: pl.count + ' of ' + sz.length + ' seizures. Make sure the staff there have your safety card.'
      });
    }

    // 5. adherence trend
    var recent = adherence(14), prior = adherence(45);
    if (Math.abs(recent - prior) >= 4) {
      var up = recent > prior;
      out.push({
        icon: up ? '📈' : '📉', tone: up ? 'mint' : 'amber',
        title: 'Med consistency is ' + (up ? 'up' : 'down') + ' — ' + recent + '% over the last 2 weeks',
        body: 'Compared with ' + prior + '% across the last 45 days.'
      });
    }

    return out;
  }

  function tally(arr) {
    var m = {}, top = null, count = 0;
    arr.forEach(function (v) {
      if (!v) return;
      m[v] = (m[v] || 0) + 1;
      if (m[v] > count) { count = m[v]; top = v; }
    });
    return { top: top, count: count };
  }

  /* ---------------- DOM refs ---------------- */

  var $appbar = document.getElementById('appbar');
  var $screen = document.getElementById('screen');
  var $tabbar = document.getElementById('tabbar');
  var $sheet = document.getElementById('sheet');
  var $backdrop = document.getElementById('backdrop');
  var $emergency = document.getElementById('emergency');
  var $toast = document.getElementById('toast');

  var view = 'home';
  var draft = {};
  var toastTimer = null;

  /* ---------------- icons ---------------- */

  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" stroke-linejoin="round"/>',
    meds: '<path d="M10.5 3.6 3.6 10.5a4.9 4.9 0 0 0 6.9 6.9l6.9-6.9a4.9 4.9 0 0 0-6.9-6.9z" stroke-linejoin="round"/><path d="M7 7.1 16.9 17" stroke-linecap="round"/>',
    track: '<path d="M3 12h3.6l2.4-7 4 14 2.4-7H21" stroke-linecap="round" stroke-linejoin="round"/>',
    safety: '<path d="M12 3 19 6v5.6c0 4.4-2.9 7.9-7 9.4-4.1-1.5-7-5-7-9.4V6z" stroke-linejoin="round"/><path d="M9.2 12.2 11.3 14.3 15 10.6" stroke-linecap="round" stroke-linejoin="round"/>',
    you: '<circle cx="12" cy="8.2" r="3.8"/><path d="M4.5 20.2a7.5 7.5 0 0 1 15 0" stroke-linecap="round"/>',
    check: '<path d="m4 8.5 3 3L12 4" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
  };

  function svg(name, cls) {
    return '<svg viewBox="0 0 24 24" class="' + (cls || '') + '" aria-hidden="true">' + ICONS[name] + '</svg>';
  }

  /* ---------------- app bar ---------------- */

  var TITLES = {
    meds: { eyebrow: 'MedMinder', title: 'Medications' },
    track: { eyebrow: 'Seizure tracker', title: 'My log' },
    safety: { eyebrow: 'School & safety', title: 'Safety card' },
    you: { eyebrow: 'Profile', title: 'You' }
  };

  function renderAppbar() {
    var eyebrow, title;
    if (view === 'home') {
      var h = new Date().getHours();
      eyebrow = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
      title = state.profile.name.split(' ')[0];
    } else {
      eyebrow = TITLES[view].eyebrow;
      title = TITLES[view].title;
    }
    $appbar.innerHTML =
      '<div class="appbar-row">' +
        '<div>' +
          '<p class="eyebrow">' + esc(eyebrow) + '</p>' +
          '<h1>' + esc(title) + '</h1>' +
        '</div>' +
        '<button class="appbar-sos" data-action="emergency" aria-label="Open emergency seizure card">SOS</button>' +
      '</div>';
  }

  /* ---------------- tab bar ---------------- */

  var TABS = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'meds', label: 'Meds', icon: 'meds' },
    { id: 'track', label: 'Seizures', icon: 'track' },
    { id: 'safety', label: 'Safety', icon: 'safety' },
    { id: 'you', label: 'You', icon: 'you' }
  ];

  function renderTabbar() {
    $tabbar.innerHTML = TABS.map(function (t) {
      return '<button class="tab" role="tab" aria-selected="' + (view === t.id) + '" data-action="go" data-view="' + t.id + '">' +
        svg(t.icon) + '<span>' + t.label + '</span></button>';
    }).join('');
  }

  /* ---------------- view: home ---------------- */

  function viewHome() {
    var t = todayKey();
    var slots = slotsFor();
    var nd = nextDose();
    var h = '<div class="view">';

    if (!nd) {
      h += '<div class="hero"><div class="hero-clear">✅ No medications set up yet</div></div>';
    } else if (nd.tomorrow) {
      h += '<div class="hero">' +
        '<div class="hero-label">All done for today</div>' +
        '<div class="hero-main"><div class="hero-time">' + fmtTime(nd.slot.time) + '</div>' +
          '<div class="hero-in">tomorrow</div></div>' +
        '<div class="hero-med">Next up: ' + esc(nd.slot.med.name) + ' · ' + esc(nd.slot.med.dose) + '</div>' +
      '</div>';
    } else {
      var gap = minutesOf(nd.slot.time) - nowMinutes();
      h += '<div class="hero">' +
        '<div class="hero-label">' + (nd.overdue ? 'Overdue dose' : 'Next dose') + '</div>' +
        '<div class="hero-main">' +
          '<div class="hero-time">' + fmtTime(nd.slot.time) + '</div>' +
          '<div class="hero-in">' + (nd.overdue ? fmtGap(gap) + ' ago' : 'in ' + fmtGap(gap)) + '</div>' +
        '</div>' +
        '<div class="hero-med">' + esc(nd.slot.med.name) + ' · ' + esc(nd.slot.med.dose) + '</div>' +
        '<div class="hero-actions">' +
          '<button class="hero-btn" data-action="mark" data-key="' + t + '" data-slot="' + nd.slot.slot + '" data-status="taken">Mark taken</button>' +
          '<button class="hero-btn secondary" data-action="mark" data-key="' + t + '" data-slot="' + nd.slot.slot + '" data-status="missed">Skipped</button>' +
        '</div>' +
      '</div>';
    }

    var ds = daysSinceSeizure();
    h += '<div class="stats">' +
      stat(adherence(14) + '%', 'Meds taken<br>last 14 days') +
      stat(ds === null ? '—' : ds, 'Days since<br>last seizure') +
      stat(state.seizures.length, 'Seizures<br>logged') +
    '</div>';

    h += '<div class="section-head"><h2>Quick actions</h2></div>';
    h += '<button class="quick-log" data-action="log-seizure">' +
      '<span class="quick-log-ico">+</span>' +
      '<span><span class="quick-log-t">Log a seizure</span>' +
      '<span class="quick-log-s">Takes about ten seconds</span></span>' +
    '</button>';
    h += '<div style="height:8px"></div>';
    h += '<button class="sos-strip" data-action="emergency">' +
      '<span class="sos-ico">🆘</span>' +
      '<span><span class="sos-t">Emergency seizure card</span>' +
      '<span class="sos-s">Show this to whoever is helping</span></span>' +
    '</button>';

    h += '<div class="section-head"><h2>Today\'s meds</h2>' +
      '<button class="link" data-action="go" data-view="meds">Manage</button></div>';
    h += slots.length
      ? slots.map(function (s) { return doseRow(t, s); }).join('')
      : emptyState('💊', 'No medications yet', 'Add your first medication to start getting reminders.');

    h += '</div>';
    return h;
  }

  function stat(num, lab) {
    return '<div class="stat"><div class="stat-num">' + num + '</div><div class="stat-lab">' + lab + '</div></div>';
  }

  function doseRow(key, s) {
    var st = statusOf(key, s.slot);
    var eff = effectiveStatus(key, s.slot, s.time);
    var done = st === 'taken' || st === 'late';
    var label = {
      taken: 'Taken', late: 'Late', missed: 'Missed',
      pending: eff === 'missed' ? 'Due' : fmtTime(s.time)
    };
    var tone = (st === 'pending' && eff === 'missed') ? 'missed' : st;
    return '<div class="dose" data-done="' + done + '">' +
      '<span class="dose-pill" style="background:' + pillBg(st) + '">' + (s.med.icon || '💊') + '</span>' +
      '<span class="dose-body">' +
        '<span class="dose-name">' + esc(s.med.name) + '</span>' +
        '<span class="dose-meta">' + esc(s.med.dose) + ' · ' + fmtTime(s.time) + '</span>' +
      '</span>' +
      '<span class="dose-right">' +
        '<span class="badge" data-tone="' + tone + '">' + label[st] + '</span>' +
        '<button class="tick" data-state="' + st + '" data-action="cycle" data-key="' + key + '" data-slot="' + s.slot + '"' +
          ' aria-label="Change status for ' + esc(s.med.name) + ' at ' + fmtTime(s.time) + '">' + svg('check') + '</button>' +
      '</span>' +
    '</div>';
  }

  function pillBg(st) {
    return st === 'taken' ? 'var(--mint-soft)'
      : st === 'late' ? 'var(--amber-soft)'
      : st === 'missed' ? 'var(--rose-soft)'
      : 'var(--violet-soft)';
  }

  /* ---------------- view: meds ---------------- */

  function viewMeds() {
    var t = todayKey();
    var slots = slotsFor();
    var h = '<div class="view">';

    var now = new Date();
    h += '<div class="section-head"><h2>Today · ' +
      MONTHS[now.getMonth()] + ' ' + now.getDate() + '</h2></div>';
    h += slots.length
      ? slots.map(function (s) { return doseRow(t, s); }).join('')
      : emptyState('💊', 'No medications yet', 'Add one below and Synara will remind you at the right times.');

    h += '<div class="section-head"><h2>Your medications</h2></div>';
    h += state.meds.map(function (m) {
      return '<button class="row" data-action="edit-med" data-id="' + m.id + '">' +
        '<span class="row-ico">' + (m.icon || '💊') + '</span>' +
        '<span class="row-body">' +
          '<span class="row-t">' + esc(m.name) + ' ' + esc(m.dose) + '</span>' +
          '<span class="row-s">' + m.times.map(fmtTime).join(' · ') +
            (m.note ? ' &nbsp;·&nbsp; ' + esc(m.note) : '') + '</span>' +
        '</span>' +
        '<span class="row-chev">›</span>' +
      '</button>';
    }).join('');

    h += '<div style="height:8px"></div>';
    h += '<button class="quick-log" data-action="add-med">' +
      '<span class="quick-log-ico">+</span>' +
      '<span><span class="quick-log-t">Add a medication</span>' +
      '<span class="quick-log-s">Name, dose, and the times you take it</span></span>' +
    '</button>';

    h += '<div class="section-head"><h2>Last 4 weeks</h2></div>';
    h += '<div class="card">' + calendar(28) + '</div>';

    h += '</div>';
    return h;
  }

  function calendar(days) {
    var out = '<div class="cal">';
    ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(function (d) { out += '<div class="cal-h">' + d + '</div>'; });

    // pad so the grid starts on the correct weekday
    var start = addDays(new Date(), -(days - 1));
    for (var p = 0; p < start.getDay(); p++) out += '<div></div>';

    var szDays = {};
    state.seizures.forEach(function (s) { szDays[s.at.split('T')[0]] = true; });

    for (var i = days - 1; i >= 0; i--) {
      var d = addDays(new Date(), -i);
      var k = dateKey(d);
      var taken = 0, counted = 0;
      slotsFor().forEach(function (s) {
        var st = effectiveStatus(k, s.slot, s.time);
        if (st === 'pending') return;
        counted++;
        if (st === 'taken' || st === 'late') taken++;
      });
      var fill = !counted ? 'empty' : taken === counted ? 'full' : taken === 0 ? 'none' : 'partial';
      out += '<div class="cal-d" data-fill="' + fill + '" data-sz="' + !!szDays[k] + '" ' +
        'title="' + relDay(k) + ' — ' + taken + '/' + counted + ' doses">' + d.getDate() + '</div>';
    }
    out += '</div>';
    out += '<div class="cal-legend">' +
      '<span><i style="background:var(--mint)"></i>All taken</span>' +
      '<span><i style="background:var(--amber-soft);box-shadow:inset 0 0 0 1px #f7d9a8"></i>Some missed</span>' +
      '<span><i style="background:var(--rose-soft)"></i>None taken</span>' +
      '<span><i style="box-shadow:inset 0 0 0 2px var(--violet)"></i>Seizure</span>' +
    '</div>';
    return out;
  }

  /* ---------------- view: seizure tracker ---------------- */

  function viewTrack() {
    var h = '<div class="view">';

    h += '<button class="quick-log" data-action="log-seizure">' +
      '<span class="quick-log-ico">+</span>' +
      '<span><span class="quick-log-t">Log a seizure</span>' +
      '<span class="quick-log-s">Date, length, trigger, where you were</span></span>' +
    '</button>';

    var ins = insights();
    if (ins.length) {
      h += '<div class="section-head"><h2>Patterns</h2></div>';
      h += ins.map(function (i) {
        return '<div class="insight">' +
          '<span class="insight-ico" style="background:' + toneBg(i.tone) + '">' + i.icon + '</span>' +
          '<span><span class="insight-t">' + i.title + '</span>' +
          '<span class="insight-s">' + i.body + '</span></span>' +
        '</div>';
      }).join('');
    }

    h += '<div class="section-head"><h2>History</h2></div>';
    if (!state.seizures.length) {
      h += emptyState('📋', 'Nothing logged yet', 'When you log a seizure it shows up here, and Synara starts looking for patterns.');
    } else {
      var sorted = state.seizures.slice().sort(function (a, b) { return parseStamp(b.at) - parseStamp(a.at); });
      h += sorted.map(function (s) {
        var d = parseStamp(s.at);
        var clock = fmtTime(pad(d.getHours()) + ':' + pad(d.getMinutes()));
        return '<div class="log">' +
          '<span class="log-date">' +
            '<span class="log-mon">' + MONTHS[d.getMonth()] + '</span>' +
            '<span class="log-day">' + d.getDate() + '</span>' +
          '</span>' +
          '<span class="log-body">' +
            '<span class="log-top">' +
              '<span class="log-type">' + esc(s.type || 'Seizure') + '</span>' +
              '<span class="log-dur">' + fmtDuration(s.duration) + '</span>' +
            '</span>' +
            '<span class="log-meta">' + relDay(dateKey(d)) + ' at ' + clock +
              (s.place ? ' · ' + esc(s.place) : '') + '</span>' +
            (s.trigger ? '<span class="log-tags"><span class="badge" data-tone="violet">' + esc(s.trigger) + '</span></span>' : '') +
            (s.notes ? '<span class="log-note">' + esc(s.notes) + '</span>' : '') +
          '</span>' +
        '</div>';
      }).join('');
    }

    h += '</div>';
    return h;
  }

  function fmtDuration(sec) {
    if (sec == null || sec === '') return '—';
    sec = +sec;
    if (!sec) return '—';
    if (sec < 60) return sec + ' sec';
    var m = Math.floor(sec / 60), s = sec % 60;
    return s ? m + 'm ' + s + 's' : m + ' min';
  }

  function toneBg(tone) {
    return tone === 'mint' ? 'var(--mint-soft)'
      : tone === 'amber' ? 'var(--amber-soft)'
      : tone === 'rose' ? 'var(--rose-soft)'
      : 'var(--violet-soft)';
  }

  /* ---------------- view: safety ---------------- */

  function viewSafety() {
    var p = state.profile, c = state.card;
    var h = '<div class="view">';

    h += '<button class="sos-strip" data-action="emergency">' +
      '<span class="sos-ico">🆘</span>' +
      '<span><span class="sos-t">Open full screen</span>' +
      '<span class="sos-s">Big text, one tap to call — hand the phone over</span></span>' +
    '</button>';

    h += '<div class="section-head"><h2>Seizure card</h2>' +
      '<button class="link" data-action="edit-card">Edit</button></div>';

    h += '<div class="safety-card">' +
      '<div class="safety-top">' +
        '<div class="safety-av">' + esc(initials(p.name)) + '</div>' +
        '<div><div class="safety-name">' + esc(p.name) + '</div>' +
          '<div class="safety-sub">' + esc(p.grade) + ' · ' + esc(p.school) + '</div></div>' +
      '</div>' +
      '<div class="safety-block">' +
        '<div class="safety-h">Diagnosis</div>' +
        '<p class="safety-p">' + esc(p.seizureType) + ' · since ' + esc(p.diagnosed) +
          (p.allergies ? '<br>Allergic to: ' + esc(p.allergies) : '') + '</p>' +
      '</div>' +
      '<div class="safety-block">' +
        '<div class="safety-h">What my seizures look like</div>' +
        '<p class="safety-p">' + esc(c.looksLike) + '</p>' +
      '</div>' +
      '<div class="safety-block">' +
        '<div class="safety-h">What to do</div>' +
        '<ol class="safety-list">' + c.firstAid.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '</div>' +
      '<div class="safety-block">' +
        '<div class="safety-h">Please also</div>' +
        '<p class="safety-p">' + esc(c.instructions) + '</p>' +
      '</div>' +
    '</div>';

    h += '<div class="section-head"><h2>Emergency contacts</h2>' +
      '<button class="link" data-action="add-contact">Add</button></div>';
    h += state.contacts.map(function (ct) {
      return '<div class="contact">' +
        '<span class="contact-av">' + esc(initials(ct.name)) + '</span>' +
        '<span><span class="contact-n">' + esc(ct.name) + (ct.primary ? ' ★' : '') + '</span>' +
          '<span class="contact-r">' + esc(ct.relation) + ' · ' + esc(ct.phone) + '</span></span>' +
        '<a class="contact-call" href="tel:' + esc(ct.phone.replace(/[^0-9+]/g, '')) + '" aria-label="Call ' + esc(ct.name) + '">📞</a>' +
      '</div>';
    }).join('');

    h += '<div class="section-head"><h2>Share</h2></div>';
    h += '<button class="row" data-action="share-card">' +
      '<span class="row-ico">🖨️</span>' +
      '<span class="row-body"><span class="row-t">Print or save as PDF</span>' +
        '<span class="row-s">For the nurse\'s office, coaches, and substitutes</span></span>' +
      '<span class="row-chev">›</span></button>';

    h += '</div>';
    return h;
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w[0]; }).join('').toUpperCase();
  }

  /* ---------------- view: you ---------------- */

  function viewYou() {
    var p = state.profile;
    var h = '<div class="view">';

    h += '<div class="card" style="display:flex;align-items:center;gap:14px">' +
      '<span class="avatar" style="width:52px;height:52px;font-size:18px">' + esc(initials(p.name)) + '</span>' +
      '<span><span style="display:block;font-size:17px;font-weight:800;letter-spacing:-.025em">' + esc(p.name) + '</span>' +
        '<span style="display:block;font-size:13px;color:var(--ink-3);margin-top:3px">' + esc(p.grade) + ' · ' + esc(p.school) + '</span></span>' +
    '</div>';

    h += '<div class="section-head"><h2>Care details</h2></div>';
    h += profileRow('🧠', 'Seizure type', p.seizureType, 'edit-profile');
    h += profileRow('🩺', 'Neurologist', p.neurologist, 'edit-profile');
    h += profileRow('⚠️', 'Allergies', p.allergies || 'None recorded', 'edit-profile');

    h += '<div class="section-head"><h2>Reminders</h2></div>';
    h += profileRow('🔔', 'Dose reminders', 'On · 5 min before each dose', 'demo-note');
    h += profileRow('🌙', 'Quiet hours', '10:00 PM – 6:30 AM', 'demo-note');
    h += profileRow('👪', 'Tell Mom if a dose is missed', 'On · after 2 hours', 'demo-note');

    h += '<div class="section-head"><h2>Data</h2></div>';
    h += profileRow('📤', 'Export for my doctor', 'Seizure log + adherence as a PDF', 'demo-note');
    h += profileRow('🔒', 'Privacy', 'Everything stays on this device', 'demo-note');

    h += '<div style="margin-top:22px">' +
      '<button class="btn danger" data-action="reset-demo">Reset demo data</button>' +
      '<p style="font-size:12px;color:var(--ink-3);text-align:center;margin:16px 4px 0;line-height:1.55">' +
        'Prototype for design review — not a medical device. Always follow your neurologist\'s instructions.</p>' +
    '</div>';

    h += '</div>';
    return h;
  }

  function profileRow(ico, title, sub, action) {
    return '<button class="row" data-action="' + action + '">' +
      '<span class="row-ico">' + ico + '</span>' +
      '<span class="row-body"><span class="row-t">' + esc(title) + '</span>' +
        '<span class="row-s">' + esc(sub) + '</span></span>' +
      '<span class="row-chev">›</span></button>';
  }

  function emptyState(ico, t, s) {
    return '<div class="empty"><div class="empty-ico">' + ico + '</div>' +
      '<div class="empty-t">' + esc(t) + '</div>' +
      '<div class="empty-s">' + esc(s) + '</div></div>';
  }

  /* ---------------- render ---------------- */

  var VIEWS = { home: viewHome, meds: viewMeds, track: viewTrack, safety: viewSafety, you: viewYou };

  function render() {
    renderAppbar();
    renderTabbar();
    $screen.innerHTML = VIEWS[view]();
  }

  function go(v) {
    if (v === view) { $screen.scrollTop = 0; return; }
    view = v;
    render();
    $screen.scrollTop = 0;
  }

  /* ---------------- sheet ---------------- */

  function openSheet(html) {
    $sheet.innerHTML = '<div class="sheet-grab"></div>' + html;
    $sheet.hidden = false;
    $backdrop.hidden = false;
    $sheet.scrollTop = 0;
  }

  function closeSheet() {
    $sheet.hidden = true;
    $backdrop.hidden = true;
    $sheet.innerHTML = '';
    draft = {};
  }

  var TRIGGERS = ['Missed sleep', 'Missed dose', 'Stress', 'Illness / fever', 'Flashing lights', 'Skipped meal', 'Not sure'];
  var TYPES = ['Focal aware', 'Focal impaired', 'Tonic-clonic', 'Absence', 'Myoclonic', 'Not sure'];

  function sheetLogSeizure() {
    var now = new Date();
    draft = { type: 'Focal aware', trigger: null };
    openSheet(
      '<h2 id="sheet-title">Log a seizure</h2>' +
      '<p class="sheet-sub">Only the first two really matter. Everything else can wait until you feel up to it.</p>' +
      '<div class="field-row">' +
        '<div class="field"><label for="sz-date">Date</label>' +
          '<input type="date" id="sz-date" value="' + dateKey(now) + '" max="' + dateKey(now) + '"></div>' +
        '<div class="field"><label for="sz-time">Time</label>' +
          '<input type="time" id="sz-time" value="' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + '"></div>' +
      '</div>' +
      '<div class="field"><label for="sz-dur">How long (seconds)</label>' +
        '<input type="number" id="sz-dur" min="0" max="3600" placeholder="e.g. 45" inputmode="numeric"></div>' +
      '<div class="field"><label>Type</label>' +
        '<div class="chips">' + TYPES.map(function (t) {
          return '<button type="button" class="chip" data-action="chip" data-group="type" data-value="' + esc(t) + '"' +
            ' aria-pressed="' + (t === draft.type) + '">' + esc(t) + '</button>';
        }).join('') + '</div></div>' +
      '<div class="field"><label>Possible trigger</label>' +
        '<div class="chips">' + TRIGGERS.map(function (t) {
          return '<button type="button" class="chip" data-action="chip" data-group="trigger" data-value="' + esc(t) + '" aria-pressed="false">' + esc(t) + '</button>';
        }).join('') + '</div></div>' +
      '<div class="field"><label for="sz-place">Where were you</label>' +
        '<input type="text" id="sz-place" placeholder="School — 4th period"></div>' +
      '<div class="field"><label for="sz-notes">Notes</label>' +
        '<textarea id="sz-notes" placeholder="What it felt like, who was there, how you felt after…"></textarea></div>' +
      '<button class="btn" data-action="save-seizure">Save to my log</button>' +
      '<button class="btn sub" data-action="close-sheet">Cancel</button>'
    );
  }

  function saveSeizure() {
    var date = val('sz-date') || todayKey();
    var time = val('sz-time') || '12:00';
    state.seizures.push({
      id: uid(),
      at: date + 'T' + time,
      duration: val('sz-dur') === '' ? null : +val('sz-dur'),
      type: draft.type || 'Not sure',
      trigger: draft.trigger || '',
      place: val('sz-place'),
      notes: val('sz-notes')
    });
    save();
    closeSheet();
    view = 'track';
    render();
    $screen.scrollTop = 0;
    toast('Seizure logged · ' + relDay(date));
  }

  function sheetMed(id) {
    var m = id ? state.meds.filter(function (x) { return x.id === id; })[0] : null;
    draft = { times: m ? m.times.slice() : ['08:00'], id: id || null };
    openSheet(
      '<h2 id="sheet-title">' + (m ? 'Edit medication' : 'Add a medication') + '</h2>' +
      '<p class="sheet-sub">Synara reminds you a few minutes before each time you set.</p>' +
      '<div class="field"><label for="md-name">Name</label>' +
        '<input type="text" id="md-name" placeholder="Levetiracetam" value="' + esc(m ? m.name : '') + '"></div>' +
      '<div class="field-row">' +
        '<div class="field"><label for="md-dose">Dose</label>' +
          '<input type="text" id="md-dose" placeholder="500 mg" value="' + esc(m ? m.dose : '') + '"></div>' +
        '<div class="field"><label for="md-note">Nickname</label>' +
          '<input type="text" id="md-note" placeholder="Keppra" value="' + esc(m ? m.note : '') + '"></div>' +
      '</div>' +
      '<div class="field"><label>Times each day</label><div id="md-times"></div></div>' +
      '<button class="btn" data-action="save-med">' + (m ? 'Save changes' : 'Add medication') + '</button>' +
      (m ? '<button class="btn danger" data-action="delete-med" data-id="' + m.id + '">Delete this medication</button>' : '') +
      '<button class="btn sub" data-action="close-sheet">Cancel</button>'
    );
    renderTimes();
  }

  function renderTimes() {
    var box = document.getElementById('md-times');
    if (!box) return;
    box.className = 'times-list';
    box.innerHTML = draft.times.map(function (t, i) {
      return '<span class="time-chip">' + fmtTime(t) +
        '<button type="button" class="time-x" data-action="rm-time" data-i="' + i + '" aria-label="Remove ' + fmtTime(t) + '">×</button></span>';
    }).join('') +
    '<button type="button" class="time-add" data-action="add-time">+ Add time</button>';
  }

  function saveMed() {
    var name = val('md-name').trim();
    if (!name) { toast('Give the medication a name first'); return; }
    if (!draft.times.length) { toast('Add at least one time'); return; }
    var data = {
      name: name,
      dose: val('md-dose').trim() || '—',
      note: val('md-note').trim(),
      times: draft.times.slice().sort(function (a, b) { return minutesOf(a) - minutesOf(b); })
    };
    var wasEdit = !!draft.id;
    if (wasEdit) {
      var m = state.meds.filter(function (x) { return x.id === draft.id; })[0];
      Object.keys(data).forEach(function (k) { m[k] = data[k]; });
    } else {
      data.id = uid();
      data.icon = '💊';
      state.meds.push(data);
    }
    save();
    closeSheet();
    view = 'meds';
    render();
    toast(wasEdit ? 'Medication updated' : 'Medication added');
  }

  function sheetContact() {
    draft = {};
    openSheet(
      '<h2 id="sheet-title">Add an emergency contact</h2>' +
      '<p class="sheet-sub">These appear on the emergency card, one tap from calling.</p>' +
      '<div class="field"><label for="ct-name">Name</label><input type="text" id="ct-name" placeholder="Priya R."></div>' +
      '<div class="field"><label for="ct-rel">Relationship</label><input type="text" id="ct-rel" placeholder="Mom"></div>' +
      '<div class="field"><label for="ct-phone">Phone</label><input type="tel" id="ct-phone" placeholder="(555) 014-2288"></div>' +
      '<button class="btn" data-action="save-contact">Add contact</button>' +
      '<button class="btn sub" data-action="close-sheet">Cancel</button>'
    );
  }

  function saveContact() {
    var name = val('ct-name').trim();
    var phone = val('ct-phone').trim();
    if (!name || !phone) { toast('Name and phone number are both needed'); return; }
    state.contacts.push({
      id: uid(),
      name: name,
      relation: val('ct-rel').trim() || 'Contact',
      phone: phone,
      primary: state.contacts.length === 0
    });
    save();
    closeSheet();
    render();
    toast('Contact added');
  }

  function sheetCard() {
    var c = state.card;
    openSheet(
      '<h2 id="sheet-title">Edit seizure card</h2>' +
      '<p class="sheet-sub">Write it the way you would want a teacher to read it in the moment.</p>' +
      '<div class="field"><label for="cd-looks">What my seizures look like</label>' +
        '<textarea id="cd-looks" style="min-height:118px">' + esc(c.looksLike) + '</textarea></div>' +
      '<div class="field"><label for="cd-inst">Specific instructions</label>' +
        '<textarea id="cd-inst" style="min-height:96px">' + esc(c.instructions) + '</textarea></div>' +
      '<button class="btn" data-action="save-card">Save card</button>' +
      '<button class="btn sub" data-action="close-sheet">Cancel</button>'
    );
  }

  function saveCard() {
    state.card.looksLike = val('cd-looks');
    state.card.instructions = val('cd-inst');
    save();
    closeSheet();
    render();
    toast('Seizure card updated');
  }

  function sheetProfile() {
    var p = state.profile;
    openSheet(
      '<h2 id="sheet-title">Care details</h2>' +
      '<p class="sheet-sub">This is what shows on the emergency card.</p>' +
      '<div class="field"><label for="pf-name">Name</label><input type="text" id="pf-name" value="' + esc(p.name) + '"></div>' +
      '<div class="field-row">' +
        '<div class="field"><label for="pf-grade">Grade</label><input type="text" id="pf-grade" value="' + esc(p.grade) + '"></div>' +
        '<div class="field"><label for="pf-school">School</label><input type="text" id="pf-school" value="' + esc(p.school) + '"></div>' +
      '</div>' +
      '<div class="field"><label for="pf-type">Seizure type</label><input type="text" id="pf-type" value="' + esc(p.seizureType) + '"></div>' +
      '<div class="field"><label for="pf-neuro">Neurologist</label><input type="text" id="pf-neuro" value="' + esc(p.neurologist) + '"></div>' +
      '<div class="field"><label for="pf-allergy">Allergies</label><input type="text" id="pf-allergy" value="' + esc(p.allergies) + '"></div>' +
      '<button class="btn" data-action="save-profile">Save</button>' +
      '<button class="btn sub" data-action="close-sheet">Cancel</button>'
    );
  }

  function saveProfile() {
    var p = state.profile;
    p.name = val('pf-name') || p.name;
    p.grade = val('pf-grade');
    p.school = val('pf-school');
    p.seizureType = val('pf-type');
    p.neurologist = val('pf-neuro');
    p.allergies = val('pf-allergy');
    save();
    closeSheet();
    render();
    toast('Details saved');
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  /* ---------------- emergency overlay ---------------- */

  function openEmergency() {
    var p = state.profile, c = state.card;
    $emergency.innerHTML = '<div class="em-inner">' +
      '<div class="em-head">' +
        '<div>' +
          '<div class="em-kicker">Seizure emergency card</div>' +
          '<div class="em-name">' + esc(p.name) + '</div>' +
          '<div class="em-sub">' + esc(p.seizureType) + ' · ' + esc(p.grade) + ', ' + esc(p.school) + '</div>' +
        '</div>' +
        '<button class="em-close" data-action="close-emergency" aria-label="Close">×</button>' +
      '</div>' +

      '<div class="em-block">' +
        '<div class="em-h">What to do right now</div>' +
        '<ol class="em-list">' + c.firstAid.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' +
      '</div>' +

      '<a class="em-911" href="tel:911">📞 Call 911</a>' +

      '<div class="em-block">' +
        '<div class="em-h">Only call 911 if</div>' +
        '<ul class="em-list">' + c.callEms.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' +
      '</div>' +

      '<div class="em-block">' +
        '<div class="em-h">What my seizures look like</div>' +
        '<p class="em-p">' + esc(c.looksLike) + '</p>' +
      '</div>' +

      '<div class="em-block">' +
        '<div class="em-h">Please also</div>' +
        '<p class="em-p">' + esc(c.instructions) + '</p>' +
      '</div>' +

      (p.allergies ? '<div class="em-block"><div class="em-h">Allergies</div>' +
        '<p class="em-p">' + esc(p.allergies) + '</p></div>' : '') +

      '<div class="em-h" style="margin:20px 0 9px">Call someone</div>' +
      state.contacts.map(function (ct) {
        return '<a class="em-contact" href="tel:' + esc(ct.phone.replace(/[^0-9+]/g, '')) + '">' +
          '<span><span class="em-c-n">' + esc(ct.name) + '</span>' +
            '<span class="em-c-r">' + esc(ct.relation) + '</span></span>' +
          '<span class="em-c-p">' + esc(ct.phone) + '</span></a>';
      }).join('') +
    '</div>';
    $emergency.hidden = false;
    $emergency.scrollTop = 0;
  }

  function closeEmergency() { $emergency.hidden = true; }

  /* ---------------- toast ---------------- */

  function toast(msg) {
    $toast.textContent = msg;
    $toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $toast.hidden = true; }, 2400);
  }

  /* ---------------- events ---------------- */

  var CYCLE = { pending: 'taken', taken: 'late', late: 'missed', missed: 'pending' };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var a = el.dataset.action;

    switch (a) {
      case 'go':
        go(el.dataset.view);
        break;

      case 'mark':
        setStatus(el.dataset.key, el.dataset.slot, el.dataset.status);
        render();
        toast(el.dataset.status === 'taken' ? 'Nice — dose marked taken' : 'Marked as skipped');
        break;

      case 'cycle': {
        var cur = statusOf(el.dataset.key, el.dataset.slot);
        setStatus(el.dataset.key, el.dataset.slot, CYCLE[cur]);
        render();
        break;
      }

      case 'log-seizure': sheetLogSeizure(); break;
      case 'save-seizure': saveSeizure(); break;

      case 'add-med': sheetMed(null); break;
      case 'edit-med': sheetMed(el.dataset.id); break;
      case 'save-med': saveMed(); break;

      case 'delete-med':
        state.meds = state.meds.filter(function (m) { return m.id !== el.dataset.id; });
        save(); closeSheet(); render(); toast('Medication removed');
        break;

      case 'add-time': {
        var input = prompt('What time? Use 24-hour format, like 08:00 or 20:30');
        if (input === null) break;
        var trimmed = input.trim();
        if (!/^\d{1,2}:\d{2}$/.test(trimmed)) { toast('Try something like 08:00'); break; }
        var parts = trimmed.split(':');
        if (+parts[0] > 23 || +parts[1] > 59) { toast('That is not a real time'); break; }
        var norm = pad(+parts[0]) + ':' + parts[1];
        if (draft.times.indexOf(norm) === -1) draft.times.push(norm);
        draft.times.sort(function (x, y) { return minutesOf(x) - minutesOf(y); });
        renderTimes();
        break;
      }

      case 'rm-time':
        draft.times.splice(+el.dataset.i, 1);
        renderTimes();
        break;

      case 'chip': {
        var group = el.dataset.group;
        var picked = el.dataset.value;
        draft[group] = draft[group] === picked ? null : picked;
        $sheet.querySelectorAll('[data-action="chip"][data-group="' + group + '"]').forEach(function (c) {
          c.setAttribute('aria-pressed', String(c.dataset.value === draft[group]));
        });
        break;
      }

      case 'add-contact': sheetContact(); break;
      case 'save-contact': saveContact(); break;

      case 'edit-card': sheetCard(); break;
      case 'save-card': saveCard(); break;

      case 'edit-profile': sheetProfile(); break;
      case 'save-profile': saveProfile(); break;

      case 'emergency': openEmergency(); break;
      case 'close-emergency': closeEmergency(); break;

      case 'share-card':
        toast('In the real app this prints or AirDrops the card');
        break;

      case 'demo-note':
        toast('Settings screen — not wired up in this prototype');
        break;

      case 'close-sheet': closeSheet(); break;

      case 'reset-demo':
        if (confirm('Reset the demo back to its starting data?')) {
          state = seed();
          save();
          closeSheet();
          closeEmergency();
          view = 'home';
          render();
          toast('Demo data reset');
        }
        break;
    }
  });

  $backdrop.addEventListener('click', closeSheet);

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!$emergency.hidden) closeEmergency();
    else if (!$sheet.hidden) closeSheet();
  });

  /* ---------------- clock ---------------- */

  function tickClock() {
    var d = new Date();
    var h = d.getHours() % 12; if (h === 0) h = 12;
    document.getElementById('sb-time').textContent = h + ':' + pad(d.getMinutes());
  }

  /* ---------------- boot ---------------- */

  load();
  render();
  tickClock();
  setInterval(tickClock, 30000);
  // keep the "in 2h 15m" countdown honest while the demo sits open
  setInterval(function () {
    if (view === 'home' && $sheet.hidden && $emergency.hidden) render();
  }, 60000);

})();

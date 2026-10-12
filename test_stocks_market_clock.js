/* Unit gate for stocks-market-clock.js — the NYSE session clock for /stocks.
   Pure: no network, no browser. UTC timestamps are written out explicitly and
   the ET meaning is noted beside each, so a DST bug cannot hide behind the
   same arithmetic in the test.
   Run: node test_stocks_market_clock.js */
const assert = require('assert');
const clock = require('./stocks-market-clock');
const { getMarketState, getLastRegularClose, HOLIDAYS, EARLY_CLOSES, COVERED_YEARS } = clock;

let passed = 0;
function check(name, fn) { fn(); passed++; console.log('  ✓ ' + name); }
const at = iso => getMarketState(new Date(iso));
const iso = d => d.toISOString();

check('open: Wed 2026-10-14 14:00Z = 10:00 EDT; next change 16:00 EDT = 20:00Z -> after', () => {
  const s = at('2026-10-14T14:00:00Z');
  assert.strictEqual(s.state, 'open');
  assert.strictEqual(s.labelKey, 'stocksClockOpen');
  assert.strictEqual(iso(s.nextChangeAt), '2026-10-14T20:00:00.000Z');
  assert.strictEqual(s.nextState, 'after');
  assert.strictEqual(s.isEarlyClose, false);
  assert.strictEqual(s.isTradingDay, true);
  assert.strictEqual(s.calendarStale, false);
  assert.strictEqual(s.etDate, '2026-10-14');
});

check('pre-market: 09:00Z = 05:00 EDT; next change 09:30 EDT = 13:30Z', () => {
  const s = at('2026-10-14T09:00:00Z');
  assert.strictEqual(s.state, 'pre');
  assert.strictEqual(iso(s.nextChangeAt), '2026-10-14T13:30:00.000Z');
});

check('after-hours: 21:00Z = 17:00 EDT; next change 20:00 EDT = 00:00Z next day', () => {
  const s = at('2026-10-14T21:00:00Z');
  assert.strictEqual(s.state, 'after');
  assert.strictEqual(iso(s.nextChangeAt), '2026-10-15T00:00:00.000Z');
  assert.strictEqual(s.nextState, 'closed-overnight');
});

check('overnight: 23:00 EDT and 03:00 EDT both closed-overnight, next change is the 04:00 EDT pre-market', () => {
  const late = at('2026-10-15T03:00:00Z'); // 23:00 EDT Oct 14
  assert.strictEqual(late.state, 'closed-overnight');
  assert.strictEqual(iso(late.nextChangeAt), '2026-10-15T08:00:00.000Z');
  const early = at('2026-10-14T07:00:00Z'); // 03:00 EDT
  assert.strictEqual(early.state, 'closed-overnight');
  assert.strictEqual(iso(early.nextChangeAt), '2026-10-14T08:00:00.000Z');
  assert.strictEqual(early.nextState, 'pre');
});

check('exact boundaries are inclusive on the new state (04:00, 09:30, 16:00, 20:00 EDT)', () => {
  assert.strictEqual(at('2026-10-14T07:59:59Z').state, 'closed-overnight');
  assert.strictEqual(at('2026-10-14T08:00:00Z').state, 'pre');
  assert.strictEqual(at('2026-10-14T13:29:59Z').state, 'pre');
  assert.strictEqual(at('2026-10-14T13:30:00Z').state, 'open');
  assert.strictEqual(at('2026-10-14T19:59:59Z').state, 'open');
  assert.strictEqual(at('2026-10-14T20:00:00Z').state, 'after');
  assert.strictEqual(at('2026-10-14T23:59:59Z').state, 'after');
  assert.strictEqual(at('2026-10-15T00:00:00Z').state, 'closed-overnight');
});

check('weekend: Friday 20:00 ET -> overnight, Saturday 00:00 ET -> weekend until Monday 00:00 ET', () => {
  const fri = at('2026-10-17T00:30:00Z'); // Fri 20:30 EDT
  assert.strictEqual(fri.state, 'closed-overnight');
  assert.strictEqual(iso(fri.nextChangeAt), '2026-10-17T04:00:00.000Z'); // Sat 00:00 EDT
  assert.strictEqual(fri.nextState, 'weekend');
  const sat = at('2026-10-17T15:00:00Z');
  assert.strictEqual(sat.state, 'weekend');
  assert.strictEqual(sat.isTradingDay, false);
  assert.strictEqual(iso(sat.nextChangeAt), '2026-10-19T04:00:00.000Z'); // Mon 00:00 EDT
  assert.strictEqual(at('2026-10-18T23:00:00Z').state, 'weekend'); // Sun 19:00 EDT
  assert.strictEqual(at('2026-10-19T04:00:00Z').state, 'closed-overnight'); // Mon 00:00 EDT
});

check('ET date, not UTC date, decides the day: Sun 2026-10-18 21:00Z is Sunday, Mon 02:00Z is still Sunday 22:00 EDT', () => {
  assert.strictEqual(at('2026-10-19T02:00:00Z').state, 'weekend');
  assert.strictEqual(at('2026-10-19T02:00:00Z').etDate, '2026-10-18');
});

check('holiday: Thanksgiving 2026-11-26 is a whole-day holiday, next change is the following midnight ET', () => {
  const s = at('2026-11-26T15:00:00Z'); // 10:00 EST
  assert.strictEqual(s.state, 'holiday');
  assert.strictEqual(s.labelKey, 'stocksClockHoliday');
  assert.strictEqual(s.holidayName, 'Thanksgiving Day');
  assert.strictEqual(s.isTradingDay, false);
  assert.strictEqual(iso(s.nextChangeAt), '2026-11-27T05:00:00.000Z'); // Fri 00:00 EST
  assert.strictEqual(at('2026-04-03T14:00:00Z').state, 'holiday'); // Good Friday
  assert.strictEqual(at('2026-07-03T14:00:00Z').state, 'holiday'); // Independence Day observed
  assert.strictEqual(at('2027-12-24T15:00:00Z').state, 'holiday'); // Christmas observed
  assert.strictEqual(at('2027-06-18T15:00:00Z').state, 'holiday'); // Juneteenth observed
});

check('early close: Fri 2026-11-27 closes 13:00 EST (18:00Z); late session ends 17:00 EST (22:00Z)', () => {
  const open = at('2026-11-27T17:30:00Z'); // 12:30 EST
  assert.strictEqual(open.state, 'open');
  assert.strictEqual(open.isEarlyClose, true);
  assert.strictEqual(iso(open.nextChangeAt), '2026-11-27T18:00:00.000Z');
  assert.strictEqual(at('2026-11-27T18:00:00Z').state, 'after');
  assert.strictEqual(at('2026-11-27T21:59:59Z').state, 'after');
  const late = at('2026-11-27T22:00:00Z');
  assert.strictEqual(late.state, 'closed-overnight');
  assert.strictEqual(late.isEarlyClose, true);
  assert.strictEqual(at('2026-12-24T18:30:00Z').state, 'after'); // Christmas Eve 13:30 EST
  assert.strictEqual(at('2027-11-26T18:30:00Z').state, 'after');
  assert.strictEqual(at('2026-11-30T18:30:00Z').state, 'open'); // a normal Monday is not early
});

check('DST spring forward (2026-03-08): open moves from 14:30Z (EST) to 13:30Z (EDT)', () => {
  assert.strictEqual(at('2026-03-06T14:29:00Z').state, 'pre');   // Fri, EST
  assert.strictEqual(at('2026-03-06T14:30:00Z').state, 'open');
  assert.strictEqual(at('2026-03-09T13:29:00Z').state, 'pre');   // Mon, EDT
  assert.strictEqual(at('2026-03-09T13:30:00Z').state, 'open');
  const sat = at('2026-03-07T12:00:00Z');
  assert.strictEqual(sat.state, 'weekend');
  assert.strictEqual(iso(sat.nextChangeAt), '2026-03-09T04:00:00.000Z'); // Mon 00:00 EDT, across the transition
  assert.strictEqual(at('2026-03-08T12:00:00Z').state, 'weekend'); // the transition day itself
});

check('DST fall back (2026-11-01): open moves from 13:30Z (EDT) to 14:30Z (EST)', () => {
  assert.strictEqual(at('2026-10-30T13:29:00Z').state, 'pre');   // Fri, EDT
  assert.strictEqual(at('2026-10-30T13:30:00Z').state, 'open');
  assert.strictEqual(at('2026-11-02T14:29:00Z').state, 'pre');   // Mon, EST
  assert.strictEqual(at('2026-11-02T14:30:00Z').state, 'open');
  const sat = at('2026-10-31T15:00:00Z');
  assert.strictEqual(iso(sat.nextChangeAt), '2026-11-02T05:00:00.000Z'); // Mon 00:00 EST
});

check('DST in 2027 (03-14 forward, 11-07 back)', () => {
  assert.strictEqual(at('2027-03-12T14:30:00Z').state, 'open');
  assert.strictEqual(at('2027-03-15T13:29:00Z').state, 'pre');
  assert.strictEqual(at('2027-03-15T13:30:00Z').state, 'open');
  assert.strictEqual(at('2027-11-05T13:30:00Z').state, 'open');
  assert.strictEqual(at('2027-11-08T14:29:00Z').state, 'pre');
  assert.strictEqual(at('2027-11-08T14:30:00Z').state, 'open');
});

check('no New Year observance on Sat 2028-01-01: Fri 2027-12-31 is a normal open day', () => {
  const s = at('2027-12-31T15:00:00Z');
  assert.strictEqual(s.state, 'open');
  assert.strictEqual(s.calendarStale, false);
});

check('calendarStale: beyond the table (2029) and before it (2025) the weekend rule applies but the flag is set', () => {
  const future = at('2029-03-07T15:00:00Z');
  assert.strictEqual(future.calendarStale, true);
  assert.strictEqual(future.state, 'open'); // weekday, no holiday knowledge, no guess
  const past = at('2025-12-25T15:00:00Z'); // a real holiday we deliberately do not know
  assert.strictEqual(past.calendarStale, true);
  assert.strictEqual(past.state, 'open');
  assert.strictEqual(at('2029-03-10T15:00:00Z').state, 'weekend');
  assert.strictEqual(at('2029-03-10T15:00:00Z').calendarStale, true);
  assert.strictEqual(at('2028-12-31T15:00:00Z').calendarStale, true); // next change crosses into 2029
  assert.strictEqual(at('2028-12-29T15:00:00Z').calendarStale, false);
  assert.strictEqual(at('2026-10-14T14:00:00Z').calendarStale, false);
});

check('accepts Date, epoch ms and ISO string; rejects garbage; defaults to now', () => {
  const ms = Date.parse('2026-10-14T14:00:00Z');
  assert.strictEqual(getMarketState(ms).state, 'open');
  assert.strictEqual(getMarketState('2026-10-14T14:00:00Z').state, 'open');
  assert.throws(() => getMarketState('not a date'), TypeError);
  assert.ok(typeof getMarketState().state === 'string');
});

check('every state maps to a label key and nextChangeAt is strictly in the future of the input', () => {
  const start = Date.parse('2026-01-01T00:00:00Z');
  for (let i = 0; i < 24 * 400; i += 7) { // sweep ~400 days at an odd stride
    const t = start + i * 3600 * 1000 + 13 * 60 * 1000;
    const s = getMarketState(t);
    assert.ok(clock.LABEL_KEYS[s.state] === s.labelKey, s.state);
    assert.ok(s.nextChangeAt.getTime() > t, 'nextChangeAt not in future at ' + new Date(t).toISOString());
    assert.notStrictEqual(s.nextState, s.state);
  }
});

check('getLastRegularClose: weekend -> Friday 16:00; early close week; open session -> previous day; stale -> null', () => {
  assert.strictEqual(iso(getLastRegularClose(new Date('2026-10-17T15:00:00Z')).at), '2026-10-16T20:00:00.000Z');
  assert.strictEqual(iso(getLastRegularClose(new Date('2026-10-19T08:00:00Z')).at), '2026-10-16T20:00:00.000Z');
  assert.strictEqual(iso(getLastRegularClose(new Date('2026-10-14T14:00:00Z')).at), '2026-10-13T20:00:00.000Z');
  const early = getLastRegularClose(new Date('2026-11-29T15:00:00Z')); // Sunday after Thanksgiving
  assert.strictEqual(iso(early.at), '2026-11-27T18:00:00.000Z');
  assert.strictEqual(early.isEarlyClose, true);
  const thanksgivingWeek = getLastRegularClose(new Date('2026-11-26T15:00:00Z')); // holiday -> Wed
  assert.strictEqual(thanksgivingWeek.etDate, '2026-11-25');
  assert.strictEqual(getLastRegularClose(new Date('2029-03-07T15:00:00Z')), null);
});

// ---- the data table, cross-checked against independent rule-based computation ----
function nthWeekday(y, month, dow, n) { // month 1-12; n>=1
  const first = new Date(Date.UTC(y, month - 1, 1)).getUTCDay();
  return 1 + ((dow - first + 7) % 7) + (n - 1) * 7;
}
function lastWeekday(y, month, dow) {
  const last = new Date(Date.UTC(y, month, 0));
  return last.getUTCDate() - ((last.getUTCDay() - dow + 7) % 7);
}
function easter(y) { // Anonymous Gregorian algorithm
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, month - 1, day);
}
const key = ms => new Date(ms).toISOString().slice(0, 10);
function observed(y, m, d) { // Sat -> Fri, Sun -> Mon
  const t = Date.UTC(y, m - 1, d), dow = new Date(t).getUTCDay();
  return dow === 6 ? t - 864e5 : dow === 0 ? t + 864e5 : t;
}
function ruleHolidays(y) {
  const out = [];
  const jan1 = new Date(Date.UTC(y, 0, 1)).getUTCDay();
  if (jan1 !== 6) out.push(key(observed(y, 1, 1))); // Saturday Jan 1: no observance
  out.push(key(Date.UTC(y, 0, nthWeekday(y, 1, 1, 3))));
  out.push(key(Date.UTC(y, 1, nthWeekday(y, 2, 1, 3))));
  out.push(key(easter(y) - 2 * 864e5));
  out.push(key(Date.UTC(y, 4, lastWeekday(y, 5, 1))));
  out.push(key(observed(y, 6, 19)));
  out.push(key(observed(y, 7, 4)));
  out.push(key(Date.UTC(y, 8, nthWeekday(y, 9, 1, 1))));
  out.push(key(Date.UTC(y, 10, nthWeekday(y, 11, 4, 4))));
  out.push(key(observed(y, 12, 25)));
  return out;
}
function ruleEarlyCloses(y, holidays) {
  const out = [];
  const thanksgiving = Date.UTC(y, 10, nthWeekday(y, 11, 4, 4));
  out.push(key(thanksgiving + 864e5));
  const isTrading = ms => { const w = new Date(ms).getUTCDay(); return w !== 0 && w !== 6 && holidays.indexOf(key(ms)) < 0; };
  const jul3 = Date.UTC(y, 6, 3), jul4dow = new Date(Date.UTC(y, 6, 4)).getUTCDay();
  if (isTrading(jul3) && jul4dow >= 2 && jul4dow <= 5) out.push(key(jul3));
  const dec24 = Date.UTC(y, 11, 24);
  if (isTrading(dec24)) out.push(key(dec24));
  return out;
}

check('holiday table equals the independently rule-computed NYSE holidays for every covered year', () => {
  COVERED_YEARS.forEach(y => {
    const fromTable = Object.keys(HOLIDAYS).filter(k => k.indexOf(y + '-') === 0).sort();
    assert.deepStrictEqual(fromTable, ruleHolidays(y).sort(), 'holidays ' + y);
  });
});

check('early-close table equals the rule-computed early closes for every covered year', () => {
  COVERED_YEARS.forEach(y => {
    const fromTable = Object.keys(EARLY_CLOSES).filter(k => k.indexOf(y + '-') === 0).sort();
    assert.deepStrictEqual(fromTable, ruleEarlyCloses(y, ruleHolidays(y)).sort(), 'early closes ' + y);
  });
});

check('table hygiene: all dates are weekdays, early closes are not holidays, 2026 and 2027 are fully covered', () => {
  Object.keys(HOLIDAYS).concat(Object.keys(EARLY_CLOSES)).forEach(k => {
    const w = new Date(k + 'T12:00:00Z').getUTCDay();
    assert.ok(w >= 1 && w <= 5, k + ' is a weekend');
    assert.ok(COVERED_YEARS.indexOf(Number(k.slice(0, 4))) >= 0, k);
  });
  Object.keys(EARLY_CLOSES).forEach(k => assert.ok(!HOLIDAYS[k], k));
  assert.ok(COVERED_YEARS.indexOf(2026) >= 0 && COVERED_YEARS.indexOf(2027) >= 0);
  assert.deepStrictEqual(Object.keys(EARLY_CLOSES).filter(k => k.startsWith('2026')), ['2026-11-27', '2026-12-24']);
  assert.deepStrictEqual(Object.keys(EARLY_CLOSES).filter(k => k.startsWith('2027')), ['2027-11-26']);
});

console.log('\n' + passed + ' checks passed');

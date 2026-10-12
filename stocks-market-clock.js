/**
 * NYSE market clock for the /stocks terminal.
 *
 * Plain script usable in the browser (`window.StocksMarketClock`) and in Node
 * (`module.exports`). No dependencies. All wall-clock logic goes through
 * Intl.DateTimeFormat with timeZone 'America/New_York', so US daylight-saving
 * transitions are handled by the platform tz database, never by a fixed offset.
 *
 * Why this exists: tokenized equities trade on-chain around the clock, but
 * primary issuance/redemption follows issuer/broker hours. The terminal shows
 * which TradFi session is live. (The PRD's own clock spec contradicted itself on
 * the Friday freeze time and ignored holidays, early closes and DST.)
 *
 * Sessions (America/New_York):
 *   pre               04:00 - 09:30
 *   open              09:30 - 16:00   (09:30 - 13:00 on early-close days)
 *   after             16:00 - 20:00   (13:00 - 17:00 on early-close days: the
 *                                      extended late session also ends at 17:00)
 *   closed-overnight  every other minute of a trading day
 *   weekend           all of Saturday and Sunday (ET)
 *   holiday           all of an NYSE full-closure day (ET)
 *
 * CALENDAR: the holiday / early-close table below is copied from the NYSE
 * published calendar (https://www.nyse.com/trade/hours-calendars, checked
 * 2026-10-12, which lists 2026-2028). IT MUST BE EXTENDED EVERY YEAR. Outside the
 * covered years the clock does NOT guess: it applies the weekend rule only and
 * returns `calendarStale: true` so the UI can say so.
 *
 * Label keys are translation keys for translations.js (added with the Phase 3
 * UI): stocksClockOpen, stocksClockPre, stocksClockAfter, stocksClockOvernight,
 * stocksClockWeekend, stocksClockHoliday.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.StocksMarketClock = api;
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var TIME_ZONE = 'America/New_York';

  // Minutes after ET midnight.
  var PRE_OPEN = 4 * 60;
  var REGULAR_OPEN = 9 * 60 + 30;
  var REGULAR_CLOSE = 16 * 60;
  var EARLY_CLOSE = 13 * 60;
  var AFTER_END = 20 * 60;
  var AFTER_END_EARLY = 17 * 60;

  // NYSE full-day closures (ET dates). Source: NYSE published calendar.
  // 2028-01-01 is a Saturday: NYSE observes no New Year's holiday (so Fri
  // 2027-12-31 is a normal trading day) and none appears below.
  var HOLIDAYS = {
    '2026-01-01': "New Year's Day",
    '2026-01-19': 'Martin Luther King, Jr. Day',
    '2026-02-16': "Washington's Birthday",
    '2026-04-03': 'Good Friday',
    '2026-05-25': 'Memorial Day',
    '2026-06-19': 'Juneteenth National Independence Day',
    '2026-07-03': 'Independence Day (observed)',
    '2026-09-07': 'Labor Day',
    '2026-11-26': 'Thanksgiving Day',
    '2026-12-25': 'Christmas Day',

    '2027-01-01': "New Year's Day",
    '2027-01-18': 'Martin Luther King, Jr. Day',
    '2027-02-15': "Washington's Birthday",
    '2027-03-26': 'Good Friday',
    '2027-05-31': 'Memorial Day',
    '2027-06-18': 'Juneteenth National Independence Day (observed)',
    '2027-07-05': 'Independence Day (observed)',
    '2027-09-06': 'Labor Day',
    '2027-11-25': 'Thanksgiving Day',
    '2027-12-24': 'Christmas Day (observed)',

    '2028-01-17': 'Martin Luther King, Jr. Day',
    '2028-02-21': "Washington's Birthday",
    '2028-04-14': 'Good Friday',
    '2028-05-29': 'Memorial Day',
    '2028-06-19': 'Juneteenth National Independence Day',
    '2028-07-04': 'Independence Day',
    '2028-09-04': 'Labor Day',
    '2028-11-23': 'Thanksgiving Day',
    '2028-12-25': 'Christmas Day'
  };

  // NYSE 13:00 ET early closes.
  var EARLY_CLOSES = {
    '2026-11-27': 'Day after Thanksgiving',
    '2026-12-24': 'Christmas Eve',
    '2027-11-26': 'Day after Thanksgiving',
    '2028-07-03': 'Day before Independence Day',
    '2028-11-24': 'Day after Thanksgiving'
  };

  // Years for which the tables above are authoritative.
  var COVERED_YEARS = [2026, 2027, 2028];

  var LABEL_KEYS = {
    open: 'stocksClockOpen',
    pre: 'stocksClockPre',
    after: 'stocksClockAfter',
    'closed-overnight': 'stocksClockOvernight',
    weekend: 'stocksClockWeekend',
    holiday: 'stocksClockHoliday'
  };

  var formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'short'
  });
  var WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  function etParts(ms) {
    var parts = formatter.formatToParts(new Date(ms));
    var o = {};
    for (var i = 0; i < parts.length; i++) o[parts[i].type] = parts[i].value;
    return {
      y: Number(o.year), m: Number(o.month), d: Number(o.day),
      h: Number(o.hour) % 24, mi: Number(o.minute), s: Number(o.second),
      dow: WEEKDAYS[o.weekday]
    };
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }

  // ET wall-clock time -> UTC Date. Boundaries used here (00:00, 04:00, 09:30,
  // 13:00, 16:00, 17:00, 20:00) never fall in the 02:00-03:00 DST gap/overlap.
  function etWallToUtc(y, m, d, h, mi) {
    var wanted = Date.UTC(y, m - 1, d, h, mi);
    var utc = wanted;
    for (var i = 0; i < 3; i++) {
      var p = etParts(utc);
      var shown = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
      var diff = shown - wanted;
      if (diff === 0) break;
      utc -= diff;
    }
    return new Date(utc);
  }

  function addDays(y, m, d, n) {
    var t = new Date(Date.UTC(y, m - 1, d + n));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }

  function isCoveredYear(y) { return COVERED_YEARS.indexOf(y) >= 0; }

  // Day type for an ET calendar date.
  function dayInfo(y, m, d, dow) {
    var key = dateKey(y, m, d);
    if (dow === 0 || dow === 6) return { type: 'weekend', key: key };
    if (isCoveredYear(y)) {
      if (HOLIDAYS[key]) return { type: 'holiday', key: key, name: HOLIDAYS[key] };
      if (EARLY_CLOSES[key]) return { type: 'trading', key: key, early: true, name: EARLY_CLOSES[key] };
    }
    return { type: 'trading', key: key, early: false };
  }

  function dowOf(y, m, d) { return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }

  // Ordered state changes within one ET day: [{at: Date, state}].
  function dayTransitions(y, m, d) {
    var info = dayInfo(y, m, d, dowOf(y, m, d));
    var out = [];
    if (info.type !== 'trading') {
      out.push({ at: etWallToUtc(y, m, d, 0, 0), state: info.type });
      return out;
    }
    var close = info.early ? EARLY_CLOSE : REGULAR_CLOSE;
    var afterEnd = info.early ? AFTER_END_EARLY : AFTER_END;
    var at = function (mins) { return etWallToUtc(y, m, d, Math.floor(mins / 60), mins % 60); };
    out.push({ at: at(0), state: 'closed-overnight' });
    out.push({ at: at(PRE_OPEN), state: 'pre' });
    out.push({ at: at(REGULAR_OPEN), state: 'open' });
    out.push({ at: at(close), state: 'after' });
    out.push({ at: at(afterEnd), state: 'closed-overnight' });
    return out;
  }

  function toMs(input) {
    if (input === undefined || input === null) return Date.now();
    var ms = input instanceof Date ? input.getTime() : new Date(input).getTime();
    if (!Number.isFinite(ms)) throw new TypeError('StocksMarketClock: invalid date');
    return ms;
  }

  function stateOnDay(parts) {
    var info = dayInfo(parts.y, parts.m, parts.d, parts.dow);
    if (info.type !== 'trading') return { state: info.type, info: info };
    var mins = parts.h * 60 + parts.mi;
    var close = info.early ? EARLY_CLOSE : REGULAR_CLOSE;
    var afterEnd = info.early ? AFTER_END_EARLY : AFTER_END;
    var state;
    if (mins < PRE_OPEN) state = 'closed-overnight';
    else if (mins < REGULAR_OPEN) state = 'pre';
    else if (mins < close) state = 'open';
    else if (mins < afterEnd) state = 'after';
    else state = 'closed-overnight';
    return { state: state, info: info };
  }

  /**
   * @param {Date|number|string} [date] defaults to now
   * @returns {{state:string, labelKey:string, nextChangeAt:Date, nextState:string,
   *   isEarlyClose:boolean, isTradingDay:boolean, holidayName:(string|null),
   *   etDate:string, calendarStale:boolean}}
   */
  function getMarketState(date) {
    var ms = toMs(date);
    var parts = etParts(ms);
    var cur = stateOnDay(parts);

    // Scan forward (at most 16 ET days) for the first transition to a different state.
    var nextChangeAt = null, nextState = null, crossedYear = parts.y;
    var day = { y: parts.y, m: parts.m, d: parts.d };
    for (var i = 0; i < 16 && !nextChangeAt; i++) {
      var trans = dayTransitions(day.y, day.m, day.d);
      for (var j = 0; j < trans.length; j++) {
        if (trans[j].at.getTime() > ms && trans[j].state !== cur.state) {
          nextChangeAt = trans[j].at; nextState = trans[j].state; crossedYear = day.y;
          break;
        }
      }
      day = addDays(day.y, day.m, day.d, 1);
    }

    return {
      state: cur.state,
      labelKey: LABEL_KEYS[cur.state],
      nextChangeAt: nextChangeAt,
      nextState: nextState,
      isEarlyClose: !!(cur.info.type === 'trading' && cur.info.early),
      isTradingDay: cur.info.type === 'trading',
      holidayName: cur.info.type === 'holiday' ? cur.info.name : null,
      etDate: cur.info.key,
      calendarStale: !isCoveredYear(parts.y) || !isCoveredYear(crossedYear)
    };
  }

  /**
   * The most recent regular-session close at or before `date` (the reference for
   * the Phase 4 weekend-drift badge). Returns null when the lookback reaches a
   * year the calendar does not cover (never a guessed close).
   * @returns {{at:Date, etDate:string, isEarlyClose:boolean}|null}
   */
  function getLastRegularClose(date) {
    var ms = toMs(date);
    var parts = etParts(ms);
    var day = { y: parts.y, m: parts.m, d: parts.d };
    for (var i = 0; i < 12; i++) {
      if (!isCoveredYear(day.y)) return null;
      var info = dayInfo(day.y, day.m, day.d, dowOf(day.y, day.m, day.d));
      if (info.type === 'trading') {
        var mins = info.early ? EARLY_CLOSE : REGULAR_CLOSE;
        var at = etWallToUtc(day.y, day.m, day.d, Math.floor(mins / 60), mins % 60);
        if (at.getTime() <= ms) return { at: at, etDate: info.key, isEarlyClose: !!info.early };
      }
      day = addDays(day.y, day.m, day.d, -1);
    }
    return null;
  }

  return {
    getMarketState: getMarketState,
    getLastRegularClose: getLastRegularClose,
    HOLIDAYS: HOLIDAYS,
    EARLY_CLOSES: EARLY_CLOSES,
    COVERED_YEARS: COVERED_YEARS,
    LABEL_KEYS: LABEL_KEYS,
    TIME_ZONE: TIME_ZONE
  };
});

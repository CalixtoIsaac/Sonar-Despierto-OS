/**
 * Fechas en hora de Veracruz (America/Mexico_City), locale es-MX, con Intl (sin librerías).
 * La API usa ISO 8601 en UTC ("2026-10-18T17:40:00.000Z") y fechas de calendario "YYYY-MM-DD".
 */
const Fechas = (() => {
  const TZ = 'America/Mexico_City';
  const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

  const dtf = new Intl.DateTimeFormat('es-MX', {
    timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  const df = new Intl.DateTimeFormat('es-MX', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
  const dfUtc = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const rtf = new Intl.RelativeTimeFormat('es-MX', { numeric: 'auto' });

  const clean = (text) => text.replace(/\./g, '').replace(/\s+de\s+/g, ' ').replace(/ /g, ' ');

  function toDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  /** "18 oct 2026, 11:40" */
  function formatDateTime(iso) {
    const d = toDate(iso);
    return d ? clean(dtf.format(d)) : '';
  }

  /** "18 oct 2026". Una fecha de calendario (YYYY-MM-DD) se muestra tal cual, sin cambio de zona. */
  function formatDate(value) {
    if (DATE_ONLY.test(String(value || ''))) return clean(dfUtc.format(new Date(`${value}T12:00:00Z`)));
    const d = toDate(value);
    return d ? clean(df.format(d)) : '';
  }

  /** "hace 2 horas", "ayer", "hace 3 días"… */
  function formatRelative(iso, now = Date.now()) {
    const d = toDate(iso);
    if (!d) return '';
    const sec = Math.round((d.getTime() - now) / 1000);
    const abs = Math.abs(sec);
    if (abs < 45) return 'hace un momento';
    const units = [['minute', 60], ['hour', 3600], ['day', 86400], ['month', 2592000], ['year', 31536000]];
    let unit = 'minute';
    let size = 60;
    for (const [u, s] of units) if (abs >= s * 0.75) { unit = u; size = s; }
    if (unit === 'day' && abs >= 7 * 86400 && abs < 30 * 86400) return rtf.format(Math.round(sec / (7 * 86400)), 'week');
    return rtf.format(Math.round(sec / size), unit);
  }

  /** "YYYY-MM-DD" de hoy en Veracruz. */
  function todayLocal(now = new Date()) {
    return ymd.format(now);
  }

  function addDays(dateText, n) {
    const d = new Date(`${dateText}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  /** Hace n días (fecha local). */
  function daysAgoLocal(n, now = new Date()) {
    return addDays(todayLocal(now), -n);
  }

  /** Desfase de la zona en minutos para un instante (p. ej. −360). */
  function offsetMinutes(instant) {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
      .formatToParts(instant).find((p) => p.type === 'timeZoneName').value; // "GMT-06:00"
    const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(part);
    if (!m) return 0;
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
  }

  /** Inicio del día local (YYYY-MM-DD) como ISO UTC. */
  function startOfLocalDayUtc(dateText) {
    const guess = new Date(`${dateText}T00:00:00Z`);
    const off = offsetMinutes(new Date(guess.getTime() + 12 * 3600e3));
    return new Date(guess.getTime() - off * 60e3).toISOString();
  }

  /** { date_from, date_to }: inicio de "desde" e inicio del día SIGUIENTE a "hasta", en UTC. */
  function localDayRangeToUtc(desde, hasta) {
    return {
      date_from: desde ? startOfLocalDayUtc(desde) : undefined,
      date_to: hasta ? startOfLocalDayUtc(addDays(hasta, 1)) : undefined
    };
  }

  /** Edad cumplida a una fecha (YYYY-MM-DD); null si no hay fecha. */
  function ageOn(birthDate, onDate = todayLocal()) {
    if (!DATE_ONLY.test(String(birthDate || ''))) return null;
    const [by, bm, bd] = birthDate.split('-').map(Number);
    const [ty, tm, td] = onDate.split('-').map(Number);
    let age = ty - by;
    if (tm < bm || (tm === bm && td < bd)) age -= 1;
    return age;
  }

  return {
    TZ, formatDateTime, formatDate, formatRelative, todayLocal, daysAgoLocal, addDays,
    localDayRangeToUtc, ageOn
  };
})();

if (typeof module !== 'undefined') module.exports = Fechas;

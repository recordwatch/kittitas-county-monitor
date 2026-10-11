import fs from 'fs';
import * as cheerio from 'cheerio';

export const ROSTER_URL = 'https://www.co.kittitas.wa.us/sheriff/roster.aspx';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5'
};

// Per-request cap. A stalled connection would otherwise hang the Actions job.
const REQUEST_TIMEOUT_MS = 30_000;

export async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry wrapper. Backoff: 2s, 5s, 10s.
async function requestWithRetry(url, options = {}, attempts = 3) {
  const backoff = [2000, 5000, 10000];
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: { ...HEADERS, ...(options.headers || {}) },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        console.error(`  Request failed (attempt ${i + 1}/${attempts}): ${err.message} — retrying in ${backoff[i] / 1000}s`);
        await delay(backoff[i]);
      }
    }
  }
  throw lastErr;
}

function clean(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

// The county prints "CITY, ST"; with both blank it still prints ",".
function cleanCity(text) {
  const t = clean(text);
  return /^[,\s]*$/.test(t) ? null : t;
}

// "$2,700.00" -> 2700. Blank or $0 -> null.
function parseDollars(text) {
  const m = (text || '').match(/\$\s*([\d,]+\.?\d*)/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(/,/g, ''));
  return v > 0 ? v : null;
}

const pad = n => String(n).padStart(2, '0');

// Kittitas prints Pacific local time as "9/4/2026 12:50:00 PM". Store
// "2026-09-04T12:50:00" so values sort as strings and browsers parse them.
export function toLocalIso(text) {
  const m = clean(text).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return clean(text) || null;
  const [, mo, dd, yyyy, h, mi, ss, ampm] = m;
  let hour = parseInt(h, 10) % 12;
  if (ampm.toUpperCase() === 'PM') hour += 12;
  return `${yyyy}-${pad(mo)}-${pad(dd)}T${pad(hour)}:${mi}:${ss}`;
}

// Each row's "Details" button carries the booking id (id="id-47726"). It is
// unique per booking and the same in the in-custody and released tables, so
// it is the booking key. "Local ID" is per person.
function bookingIdOf($, row) {
  return ($(row).find('input.get-details').attr('id') || '').replace(/^id-/, '') || null;
}

// The page holds two tables: #tblRoster-here (in custody: name, age,
// city & state, local id, arrest date) and #tblRoster-released (recent
// releases: name, age, city & state, arrest date, released date). The
// county's page sometimes repeats a row; callers dedupe by id.
export function parseRoster(html) {
  const $ = cheerio.load(html);

  const inCustody = $('#tblRoster-here tr.inmateRow').toArray().map(row => {
    const [name, age, city, localId, arrestDate] = $(row).children('td').toArray().map(td => clean($(td).text()));
    return {
      id: bookingIdOf($, row),
      localId: localId || null,
      name,
      age: age ? Number(age) : null,
      city: cleanCity(city),
      bookedAt: toLocalIso(arrestDate)
    };
  }).filter(p => p.id && p.name);

  const released = $('#tblRoster-released tr').toArray().slice(1).map(row => {
    const [name, age, city, arrestDate, releasedDate] = $(row).children('td').toArray().map(td => clean($(td).text()));
    return {
      id: bookingIdOf($, row),
      name,
      age: age ? Number(age) : null,
      city: cleanCity(city),
      bookedAt: toLocalIso(arrestDate),
      releasedAt: toLocalIso(releasedDate)
    };
  }).filter(p => p.id && p.name);

  // ASP.NET form state needed to replay the "Details" button for this page.
  const formState = {
    __VIEWSTATE: $('#__VIEWSTATE').val(),
    __VIEWSTATEGENERATOR: $('#__VIEWSTATEGENERATOR').val(),
    __EVENTVALIDATION: $('#__EVENTVALIDATION').val()
  };

  return { inCustody, released, formState };
}

// The details panel (#pnDetails) after a postback: "Sex: M", an offenses
// table (Statute, Offense, Case, Court) and "Total Bail: $X".
export function parseDetails(html) {
  const $ = cheerio.load(html);
  const panel = $('#pnDetails');
  const text = clean(panel.text());
  if (!/Offenses:/.test(text)) return null;

  const charges = panel.find('table tr').toArray().slice(1).map(tr => {
    // toArray() rather than .map().get(): cheerio's map drops null results,
    // which would shift every column after an empty cell.
    const [statute, description, caseNumber, court] = $(tr).children('td').toArray().map(td => clean($(td).text()) || null);
    return { description, statute, caseNumber, court };
  }).filter(c => c.description);

  return {
    sex: text.match(/Sex:\s*([A-Z])\b/)?.[1] || null,
    charges,
    bondTotal: parseDollars(text.match(/Total Bail:\s*(\$[\d,.]+)/)?.[1])
  };
}

const PREFIX = 'ctl00$ctl00$bodyPlaceHolder$departmentBodyPlaceholder$';

// Replays what the "Details" button does: post the page's form state with
// the booking id in the hidden field. Returns null on any failure so callers
// keep what they already have. Works for released bookings too.
export async function fetchDetails(formState, id) {
  try {
    const body = new URLSearchParams({
      ...formState,
      [`${PREFIX}hfID`]: id,
      [`${PREFIX}btnGetDetails`]: 'GetDetails'
    });
    const html = await requestWithRetry(ROSTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': ROSTER_URL },
      body
    }, 2);
    return parseDetails(html);
  } catch (err) {
    console.error(`  Details fetch failed for ${id}: ${err.message}`);
    return null;
  }
}

// Set ROSTER_HTML_FILE to parse a saved copy instead of fetching.
export async function fetchRoster() {
  const html = process.env.ROSTER_HTML_FILE
    ? fs.readFileSync(process.env.ROSTER_HTML_FILE, 'utf-8')
    : await requestWithRetry(ROSTER_URL);
  return parseRoster(html);
}

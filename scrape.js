import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchRoster, fetchDetails, delay } from './scrapers/kittitas.js';
import { nowLocalIso } from './utils.js';
import { buildStats } from './stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.join(__dirname, 'data');
fs.mkdirSync(STORAGE_DIR, { recursive: true });

const LOG_FILE    = path.join(STORAGE_DIR, 'change_log.json');
const STATS_FILE  = path.join(STORAGE_DIR, 'stats.json');
const STATUS_FILE = path.join(STORAGE_DIR, 'status.json');

// If the roster suddenly shrinks below this fraction of who we think is in
// custody, assume the page is broken/partial rather than mass release, and
// don't mark anyone released this run.
const MIN_ROSTER_RATIO = 0.5;

// Details (sex, charges, bail) cost one ~190 KB request each. Each run
// fetches them for new bookings, new releases, and this many existing
// inmates (least recently checked first) — ~115 people cycle through about
// every 3 hours instead of ~230 requests an hour.
const REFRESH_PER_RUN = Number(process.env.REFRESH_PER_RUN ?? 20);
const DETAILS_DELAY_MS = 500;

// The released table covers about two days; keep retrying matches for three.
const RELEASE_MATCH_DAYS = 3;

function readJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    console.error(`Could not parse ${file}: ${e.message}`);
    process.exit(1); // never overwrite history with an empty array
  }
  return fallback;
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

function applyDetails(entry, details, now) {
  entry.detailsCheckedAt = now;
  if (!details) return; // keep what we have
  if (details.sex) entry.sex = details.sex;
  if (details.charges.length) entry.charges = details.charges;
  entry.bondTotal = details.bondTotal;
}

async function run() {
  const now = nowLocalIso();
  console.log(`[${now}] Running scrape...`);

  // change_log.json is every booking we've ever seen, newest booking first.
  const log = readJSON(LOG_FILE, []);
  const isFirstRun = log.length === 0;

  let roster;
  try {
    roster = await fetchRoster();
  } catch (err) {
    console.error('Roster fetch failed:', err.message);
    process.exit(1);
  }
  const { inCustody: inmates, released: releasedList, formState } = roster;

  const byId = new Map(log.map(e => [e.id, e]));
  const wasInCustody = log.filter(e => e.status === 'in_custody');

  if (inmates.length === 0 || (wasInCustody.length > 20 && inmates.length < wasInCustody.length * MIN_ROSTER_RATIO)) {
    console.error(`Got ${inmates.length} inmates (expected ~${wasInCustody.length}) — skipping diff to avoid false releases.`);
    process.exit(1);
  }

  const currentIds = new Set();
  const needDetails = [];

  for (const inmate of inmates) {
    if (currentIds.has(inmate.id)) continue; // the county's page repeats rows sometimes
    currentIds.add(inmate.id);

    const existing = byId.get(inmate.id);
    if (!existing) {
      console.log(`  NEW: ${inmate.name} (${inmate.id})`);
      const entry = {
        ...inmate,
        sex: null,
        charges: [],
        bondTotal: null,
        detailsCheckedAt: null,
        status: 'in_custody',
        firstSeen: now,
        releasedAt: null,
        releaseSource: null,
        // true = already in jail when monitoring started, so we didn't watch
        // this booking happen. Stats use it to avoid skewed "new booking" counts.
        baseline: isFirstRun
      };
      log.push(entry);
      byId.set(entry.id, entry);
      needDetails.push(entry);
      continue;
    }

    // Still in custody: refresh fields that change during a stay.
    existing.status = 'in_custody';
    existing.releasedAt = null;
    existing.releaseSource = null;
    existing.name = inmate.name;
    existing.age = inmate.age ?? existing.age;
    existing.city = inmate.city || existing.city;
  }

  // Releases: the released table lists the same booking ids with the
  // official release time. Fall back to the scrape where they went missing.
  const releasedById = new Map(releasedList.filter(r => r.releasedAt).map(r => [r.id, r]));

  let releasedCount = 0;
  for (const entry of wasInCustody) {
    if (currentIds.has(entry.id)) continue;
    const official = releasedById.get(entry.id);
    console.log(`  RELEASED: ${entry.name} (${entry.id})${official ? ` at ${official.releasedAt}` : ''}`);
    entry.status = 'released';
    entry.releasedAt = official?.releasedAt || now;
    entry.releaseSource = official ? 'official' : 'observed';
    needDetails.push(entry); // details still load after release: capture final charges
    releasedCount++;
  }

  const cutoff = new Date(Date.now() - RELEASE_MATCH_DAYS * 86_400_000).toISOString().slice(0, 10);
  for (const entry of log) {
    if (entry.status !== 'released' || entry.releaseSource !== 'observed') continue;
    if ((entry.releasedAt || '') < cutoff) continue;
    const official = releasedById.get(entry.id);
    if (!official) continue;
    entry.releasedAt = official.releasedAt;
    entry.releaseSource = 'official';
    console.log(`  Matched release time for ${entry.name}: ${official.releasedAt}`);
  }

  // Bookings that started and ended between two runs never reach the
  // in-custody table, but the released table still lists them.
  let releasedOnlyCount = 0;
  for (const person of releasedById.values()) {
    if (byId.has(person.id) || currentIds.has(person.id)) continue;
    console.log(`  RELEASED (released list only): ${person.name} (${person.id})`);
    const entry = {
      ...person,
      localId: null,
      sex: null,
      charges: [],
      bondTotal: null,
      detailsCheckedAt: null,
      status: 'released',
      firstSeen: now,
      releaseSource: 'official',
      fromReleasedList: true,
      baseline: false
    };
    log.push(entry);
    byId.set(entry.id, entry);
    needDetails.push(entry);
    releasedOnlyCount++;
  }

  // Details: everything queued above, then the least recently checked
  // people still in custody.
  const queued = new Set(needDetails.map(e => e.id));
  const refresh = log
    .filter(e => e.status === 'in_custody' && !queued.has(e.id))
    .sort((a, b) => (a.detailsCheckedAt || '').localeCompare(b.detailsCheckedAt || ''))
    .slice(0, REFRESH_PER_RUN);
  const toFetch = process.env.SKIP_DETAILS ? [] : [...needDetails, ...refresh];

  console.log(`[${nowLocalIso()}] Fetching details for ${needDetails.length} new/released + ${refresh.length} refresh...`);
  let failures = 0;
  for (const entry of toFetch) {
    const details = await fetchDetails(formState, entry.id);
    if (!details) failures++;
    applyDetails(entry, details, now);
    await delay(DETAILS_DELAY_MS);
  }
  console.log(`[${nowLocalIso()}] Details done. ${toFetch.length - failures} ok, ${failures} failed.`);

  log.sort((a, b) => (b.bookedAt || '').localeCompare(a.bookedAt || ''));

  writeJSON(LOG_FILE, log);
  writeJSON(STATUS_FILE, { inCustody: currentIds.size, lastUpdated: now });
  writeJSON(STATS_FILE, buildStats(log, now));
  console.log(`[${nowLocalIso()}] Done. ${needDetails.length - releasedCount - releasedOnlyCount} new, ${releasedCount} released, ${releasedOnlyCount} released-list only, ${currentIds.size} in custody.`);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

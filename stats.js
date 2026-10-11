// Precomputed stats for the static frontend. Kittitas publishes age, sex
// and home city (no housing, arresting agency or arrest type), so stats
// cover demographics, charges, courts, bail, and length of stay.

export const COURT_NAMES = {
  SUP: 'Superior Court',
  LDC: 'Lower Kittitas District Court',
  UDC: 'Upper Kittitas District Court',
  USM: 'U.S. Marshals hold'
};

const AGE_GROUPS = [['18–24', 0, 25], ['25–34', 25, 35], ['35–44', 35, 45], ['45–54', 45, 55], ['55+', 55, 200]];

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
}

function round1(n) {
  return n == null ? null : Math.round(n * 10) / 10;
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const k = keyFn(item);
    if (k) counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

function topN(counts, n) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count, pct: total ? round1((count / total) * 100) : 0 }));
}

// Date-only strings ("2026-09-22") parse as UTC in JS; add a time so they
// parse as local midnight like the full timestamps do.
function toDate(ts) {
  return new Date(ts.length === 10 ? `${ts}T00:00:00` : ts);
}

// Skagit gives a full incarceration timestamp, so that's the start time.
function bookingStart(e) {
  return e.bookedAt;
}

function daysBetween(start, end) {
  if (!start || !end) return null;
  const ms = toDate(end) - toDate(start);
  return ms > 0 ? ms / 86_400_000 : null;
}

// "2026-10-10T04:26:29" -> "2026-10-10"
function day(ts) {
  return ts ? ts.slice(0, 10) : null;
}

export function buildStats(log, now) {
  const inCustody = log.filter(e => e.status === 'in_custody');
  const released  = log.filter(e => e.status === 'released');
  // Bookings we actually watched happen (not already in jail on day one).
  const observed  = log.filter(e => !e.baseline);
  const allCharges = log.flatMap(e => e.charges || []);

  // Bookings per day, last 30 days, keyed by the jail's own booking time.
  // Only includes people still booked or seen released, so days before
  // monitoring started undercount anyone released before we were watching.
  const today = new Date(now.slice(0, 10) + 'T12:00:00');
  const bookingsByDay = [];
  const perDay = countBy(log, e => day(e.bookedAt));
  const releasesPerDay = countBy(released, e => day(e.releasedAt));
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    bookingsByDay.push({ date: key, booked: perDay[key] || 0, released: releasesPerDay[key] || 0 });
  }

  // Length of stay for releases, measured from the jail's booking time.
  const stays = released.map(e => daysBetween(bookingStart(e), e.releasedAt)).filter(v => v != null);
  const stayBuckets = [
    ['< 1 day', 0, 1], ['1–3 days', 1, 3], ['3–7 days', 3, 7],
    ['1–4 weeks', 7, 28], ['1–3 months', 28, 90], ['3+ months', 90, Infinity]
  ].map(([label, lo, hi]) => ({ label, count: stays.filter(s => s >= lo && s < hi).length }));

  // Current population: how long people have been held so far.
  const heldSoFar = inCustody.map(e => daysBetween(bookingStart(e), now)).filter(v => v != null);

  const bonds = inCustody.map(e => e.bondTotal).filter(v => v != null);

  return {
    generatedAt: now,
    monitoringSince: log.reduce((min, e) => (!min || e.firstSeen < min ? e.firstSeen : min), null),
    totals: {
      bookingsTracked: log.length,
      bookingsObserved: observed.length,
      releasesObserved: released.length,
      inCustody: inCustody.length,
      uniquePeople: new Set(log.map(e => e.inmateNumber)).size
    },
    bookingsByDay,
    topCharges: topN(countBy(allCharges, c => c.description), 20),
    courts: topN(countBy(allCharges, c => c.court), 12)
      .map(c => ({ ...c, label: COURT_NAMES[c.name] || c.name })),
    sex: topN(countBy(log, e => ({ M: 'Male', F: 'Female' })[e.sex] || null), 4),
    ages: {
      median: median(log.map(e => e.age).filter(a => a != null)),
      groups: AGE_GROUPS.map(([label, lo, hi]) => ({
        label, count: log.filter(e => e.age != null && e.age >= lo && e.age < hi).length
      }))
    },
    // Home city as the county lists it (e.g. "ELLENSBURG, WA").
    topCities: topN(countBy(log, e => e.city), 12),
    releaseSources: {
      official: released.filter(e => e.releaseSource === 'official').length,
      observed: released.filter(e => e.releaseSource === 'observed').length,
      releasedListOnly: released.filter(e => e.fromReleasedList).length
    },
    stay: {
      releasedCount: stays.length,
      medianDays: round1(median(stays)),
      meanDays: round1(mean(stays)),
      buckets: stayBuckets,
      currentMedianDaysHeld: round1(median(heldSoFar)),
      currentLongestDaysHeld: round1(heldSoFar.length ? Math.max(...heldSoFar) : null)
    },
    bond: {
      withBond: bonds.length,
      noBond: inCustody.length - bonds.length,
      medianBond: median(bonds),
      maxBond: bonds.length ? Math.max(...bonds) : null,
      totalBond: bonds.reduce((a, b) => a + b, 0)
    },
    chargesPerBooking: round1(mean(log.map(e => (e.charges || []).length)))
  };
}

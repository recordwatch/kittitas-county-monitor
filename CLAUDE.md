# Kittitas Jail Roster — Project Context

## What it is
A public jail roster monitor for Kittitas County, WA, built from the same
template as `recordwatch/skagit-county-monitor`, `clark-county-monitor`,
`lewis-county-monitor` and `cowlitz-county-monitor` (modeled on the Kitsap
monitor). Scrapes the jail roster, tracks bookings and releases, and serves a
static site.

## Source
https://www.co.kittitas.wa.us/sheriff/roster.aspx — one ASP.NET WebForms page
with two tables:
- `#tblRoster-here` (in custody): name, age, city & state, Local ID, arrest
  date+time.
- `#tblRoster-released` (about the last 2 days): name, age, city & state,
  arrest date, released date+time.

Each row's "Details" button carries the booking id (`id="id-47726"`). Details
(sex, charges with statute / offense / case / court, total bail) come from
replaying the button's **form postback**: POST the page's `__VIEWSTATE`,
`__VIEWSTATEGENERATOR`, `__EVENTVALIDATION`, the hidden `hfID` = booking id and
`btnGetDetails=GetDetails`; the response is the whole page (~190 KB) with
`#pnDetails` filled in. The old `robots/JailRoster.asmx/GetInmateDetails`
endpoint returns 401 — don't use it. Details still load after release.

## Architecture
- **Scraper:** `scrape.js` (orchestrator) + `scrapers/kittitas.js` (Cheerio parsing), Node 20 built-in fetch
- **Schedule:** `.github/workflows/scrape.yml`, cron every 30 min (backup only — see Scheduling)
- **Storage:** JSON committed to `data/` — no server, no database
- **Frontend:** React + Vite in `frontend/`, built and pushed to the `gh-pages` branch

## Key facts / gotchas
- Booking `id` = the Details button id. It's unique per booking and shared by
  both tables, so releases match exactly. `localId` is per person.
- The county's page sometimes repeats an identical row; dedupe by id.
- Details cost one ~190 KB request each. Each run fetches details for new
  bookings, new releases (final charges) and released-list-only bookings,
  plus `REFRESH_PER_RUN` (20) least-recently-checked people, 500 ms apart —
  everyone refreshes about every 3 hours. The first run fetches all (~130,
  ~3 min).
- Bookings that start and end between runs only appear in the released
  table; they're added with `fromReleasedList: true`.
- Release: `releaseSource: 'official'` from the released table, else
  `'observed'` (scrape time); retried for 3 days.
- "Arrest Date" is used as `bookedAt` (it's the only intake time given).
- Blank city & state prints as ","; stored as null.
- First county with demographics: age (roster) and sex (details). No
  arresting agency, arrest type or housing location.
- Court codes: SUP Superior, LDC / UDC = Lower / Upper Kittitas District
  Court, USM = U.S. Marshals hold; OS, CEMU, OCC unknown.
- Dates are `M/D/YYYY h:mm:ss AM/PM` Pacific; stored as `YYYY-MM-DDTHH:MM:SS`.
- Safety: if the roster comes back empty or < 50% of the previous in-custody
  count, the run exits non-zero without marking anyone released.

## Scheduling (important)
- GitHub's own `schedule:` cron is unreliable for small repos — Kitsap's
  measured gaps were 3–9 hours (median ~5.5 h), not 30 minutes.
- The real trigger should be an external **cron-job.org** job that POSTs
  every 30 minutes to
  `https://api.github.com/repos/recordwatch/kittitas-county-monitor/actions/workflows/scrape.yml/dispatches`
  with body `{"ref":"main"}`, using the same fine-grained token as the other
  county repos (Actions: read & write). That token must include this repo,
  and it **expires in August 2027**.

## Data files
- `data/change_log.json` — every booking ever seen, newest `bookedAt` first
- `data/stats.json` — precomputed stats (`stats.js`)
- `data/status.json` — `{ inCustody, lastUpdated }`

## Local dev
- `ROSTER_HTML_FILE=page.html SKIP_DETAILS=1 node scrape.js` parses a saved
  page without posting for details
- Node's fetch ignores HTTPS_PROXY; in a proxied sandbox run with
  `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=<ca bundle>`
- Frontend: copy `data/*.json` into `frontend/public/data/`, then `cd frontend && npm run dev`

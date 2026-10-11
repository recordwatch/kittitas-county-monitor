// Timestamps are Pacific local strings: "2026-10-10T04:26:29".
// Format them by slicing the string rather than via Date, so the display
// doesn't shift if the viewer is in a different time zone.

export function formatDate(ts) {
  if (!ts) return ''
  const [y, m, d] = ts.slice(0, 10).split('-')
  return `${m}/${d}/${y.slice(2)}`
}

export function formatTime(ts) {
  if (!ts || ts.length < 16) return ''
  let h = parseInt(ts.slice(11, 13), 10)
  const min = ts.slice(14, 16)
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${min} ${ampm}`
}

export function formatDateTime(ts) {
  return ts ? `${formatDate(ts)} ${formatTime(ts)}`.trim() : ''
}

// Date-only strings ("2026-09-22") parse as UTC in JS; add a time so they
// parse as local midnight like full timestamps do.
function toDate(ts) {
  return new Date(ts.length === 10 ? `${ts}T00:00:00` : ts)
}

export function formatMoney(n) {
  if (n == null) return null
  return '$' + Number(n).toLocaleString('en-US')
}

export function timeHeld(start, end) {
  if (!start || !end) return null
  const ms = toDate(end) - toDate(start)
  if (!(ms > 0)) return null
  const totalMins = Math.floor(ms / 60000)
  const days = Math.floor(totalMins / 1440)
  const hours = Math.floor((totalMins % 1440) / 60)
  const mins = totalMins % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

export const COURT_NAMES = {
  SUP: 'Superior Court',
  LDC: 'Lower Kittitas District Court',
  UDC: 'Upper Kittitas District Court',
  USM: 'U.S. Marshals hold'
}

export function courtName(code) {
  return COURT_NAMES[code] || code
}

export function sexName(code) {
  return { M: 'Male', F: 'Female' }[code] || code || 'N/A'
}

// "~" marks release times we estimated (first scrape they were missing)
// rather than read from the official released list.
export function releaseTime(entry, fmt) {
  return (entry.releaseSource === 'official' ? '' : '~') + fmt(entry.releasedAt)
}

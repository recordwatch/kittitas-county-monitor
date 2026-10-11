import { formatDate, formatTime, timeHeld, releaseTime } from '../format'

// One section per day, newest first. A booking shows under BOOKED on the
// day it was booked and under RELEASED on the day it was released.
export default function HistoryLog({ entries, search = '' }) {
  const q = search.toLowerCase()
  const filtered = q ? entries.filter(e => e.name.toLowerCase().includes(q)) : entries

  if (filtered.length === 0) {
    return <div className="empty">No records match your search.</div>
  }

  const days = {}
  const dayOf = key => (days[key] ||= { booked: [], released: [] })
  for (const e of filtered) {
    // Skip "booked" lines for people already in jail when monitoring began —
    // we didn't see those bookings happen, so they'd misleadingly cluster.
    if (!e.baseline && e.bookedAt) dayOf(e.bookedAt.slice(0, 10)).booked.push(e)
    if (e.releasedAt) dayOf(e.releasedAt.slice(0, 10)).released.push(e)
  }
  const sortedDays = Object.keys(days).sort().reverse()

  return (
    <div className="history-log">
      <div className="history-header">
        <h2>Booked and Released Log</h2>
        <p className="history-subtitle">Every booking and release we've recorded, newest first</p>
      </div>

      {sortedDays.map(key => {
        const { booked, released } = days[key]
        return (
          <div key={key} className="history-day">
            <div className="history-date">{formatDate(key)}</div>

            {booked.length > 0 && (
              <div className="history-section">
                <div className="history-section-title">BOOKED ({booked.length})</div>
                <ul className="history-list">
                  {booked.map(e => (
                    <li key={e.id} className="history-item">
                      <span className="history-name">{e.name}</span>
                      <span className="history-meta">
                        Booked: {formatTime(e.bookedAt)}
                        {e.charges?.length > 0 && (
                          <span className="history-charges"> | Charges: {e.charges.map(c => c.description).join(', ')}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {released.length > 0 && (
              <div className="history-section">
                <div className="history-section-title">RELEASED ({released.length})</div>
                <ul className="history-list">
                  {released.map(e => {
                    const held = timeHeld(e.bookedAt, e.releasedAt)
                    return (
                      <li key={e.id} className="history-item">
                        <span className="history-name">{e.name}</span>
                        <span className="history-meta">
                          Released: {releaseTime(e, formatTime)}
                          {held && <span className="history-time-served"> | Time held: {held}</span>}
                          {e.charges?.length > 0 && (
                            <span className="history-charges"> | Charges: {e.charges.map(c => c.description).join(', ')}</span>
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

import { useState } from 'react'
import { formatDateTime, formatMoney, timeHeld, courtName, sexName, releaseTime } from '../format'

export default function BookingCard({ entry }) {
  const [open, setOpen] = useState(false)

  const isReleased = entry.status === 'released'
  const held = isReleased ? timeHeld(entry.bookedAt, entry.releasedAt) : null

  return (
    <div className={`card ${isReleased ? 'card-released' : 'card-custody'}`}>
      <div className="card-header" onClick={() => setOpen(!open)}>
        <div className="card-left">
          <div className="card-name">{entry.name}</div>
          <div className="card-meta">
            Booking #{entry.id} &nbsp;·&nbsp; Arrested: {formatDateTime(entry.bookedAt) || 'N/A'}
            {held && <span className="card-time-held"> &nbsp;·&nbsp; Held: {held}</span>}
          </div>
        </div>
        <div className="card-right">
          <span className={`badge ${isReleased ? 'badge-released' : 'badge-custody'}`}>
            {isReleased ? 'Released' : 'In Custody'}
          </span>
          <span className="card-toggle">{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div className="card-body">
          {isReleased && entry.releasedAt && (
            <div className="card-release-row">
              Released: {releaseTime(entry, formatDateTime)}
              {held && <span className="card-time-held-detail"> &nbsp;·&nbsp; Time held: {held}</span>}
            </div>
          )}
          {entry.fromReleasedList && (
            <div className="card-release-row">
              Booked and released between our checks — taken from the county's released list.
            </div>
          )}

          <div className="card-description">
            <div className="desc-row">
              <span>Age</span><span>{entry.age ?? 'N/A'}</span>
            </div>
            <div className="desc-row">
              <span>Sex</span><span>{sexName(entry.sex)}</span>
            </div>
            <div className="desc-row">
              <span>City</span><span>{entry.city || 'N/A'}</span>
            </div>
            <div className="desc-row">
              <span>Total Bail</span><span>{formatMoney(entry.bondTotal) || 'None'}</span>
            </div>
          </div>

          {entry.charges?.length > 0 && (
            <div className="card-charges">
              <div className="charges-title">Charges ({entry.charges.length})</div>
              {entry.charges.map((c, i) => (
                <div key={i} className="charge-row">
                  <div className="charge-violation">
                    {c.description}
                    {c.statute && <span className="charge-add-desc"> — RCW {c.statute}</span>}
                  </div>
                  {c.court && (
                    <div className="charge-court">
                      {courtName(c.court)}{c.caseNumber && ` · ${c.caseNumber}`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

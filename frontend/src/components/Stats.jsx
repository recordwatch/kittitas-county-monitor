import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { formatDate, formatMoney } from '../format'

// Same palette as the Kitsap site.
const C = {
  primary: '#5B7FA6',
  accent:  '#7AA8C4',
  muted:   '#7A8A96',
  grid:    '#404850',
  green:   '#4A8A6A',
}

function SectionTitle({ children }) {
  return <h3 className="stats-section-title">{children}</h3>
}

function fmtN(n) { return n != null ? Number(n).toLocaleString() : '—' }

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="stats-tooltip">
      <div className="stats-tooltip-label">{label}</div>
      {payload.map(p => (
        <div key={p.name} className="stats-tooltip-val">{p.name}: {fmtN(p.value)}</div>
      ))}
    </div>
  )
}

function StatBox({ num, label }) {
  return (
    <div className="stat-box">
      <div className="stat-box-num">{num}</div>
      <div className="stat-box-label">{label}</div>
    </div>
  )
}

function CountTable({ rows, nameKey = 'name', label }) {
  return (
    <table className="stats-table">
      <thead><tr><th>{label}</th><th>Count</th><th>%</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.name}>
            <td>{r[nameKey]}</td>
            <td className="stats-table-num">{fmtN(r.count)}</td>
            <td className="stats-table-pct">{r.pct}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function Stats() {
  const [s, setS] = useState(null)

  useEffect(() => {
    fetch('./data/stats.json').then(r => r.json()).then(setS)
  }, [])

  if (!s) return <div className="loading">Loading stats...</div>

  const days = s.bookingsByDay.map(d => ({ ...d, label: formatDate(d.date).slice(0, 5) }))

  return (
    <div className="stats-page">
      <div className="stats-header">
        <h2>Statistics</h2>
        <p className="stats-subtitle">
          Monitoring since {formatDate(s.monitoringSince)}. Release times come from the jail's
          released list; times marked ~ are when the person disappeared from the roster and
          wasn't on that list. Charges for each person are refreshed about every 3 hours.
        </p>
      </div>

      <div className="stats-card">
        <div className="stat-boxes">
          <StatBox num={fmtN(s.totals.inCustody)} label="In custody now" />
          <StatBox num={fmtN(s.totals.bookingsTracked)} label="Bookings tracked" />
          <StatBox num={fmtN(s.totals.releasesObserved)} label="Releases seen" />
          <StatBox num={s.stay.medianDays != null ? `${s.stay.medianDays}d` : '—'} label="Median stay (released)" />
        </div>
      </div>

      <div className="stats-card">
        <SectionTitle>Bookings &amp; releases — last 30 days</SectionTitle>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={days} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 10 }} interval={4} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Legend wrapperStyle={{ fontSize: 11, color: C.muted }} />
            <Bar dataKey="booked" name="Booked" fill={C.primary} maxBarSize={14} />
            <Bar dataKey="released" name="Released" fill={C.green} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
        <div className="stats-card-note">
          Days before monitoring began only count people who were still in jail when we started,
          so early bookings are undercounted and early releases are missing.
        </div>
      </div>

      <div className="stats-card">
        <SectionTitle>Most common charges</SectionTitle>
        <CountTable rows={s.topCharges} label="Charge" />
      </div>

      <div className="stats-grid-2">
        <div className="stats-card">
          <SectionTitle>Home city</SectionTitle>
          <CountTable rows={s.topCities} label="City" />
        </div>
        <div className="stats-card">
          <SectionTitle>Court (by charge)</SectionTitle>
          <CountTable rows={s.courts} nameKey="label" label="Court" />
        </div>
      </div>

      <div className="stats-grid-2">
        <div className="stats-card">
          <SectionTitle>Length of stay (released)</SectionTitle>
          <table className="stats-table">
            <tbody>
              {s.stay.buckets.map(b => (
                <tr key={b.label}><td>{b.label}</td><td className="stats-table-num">{fmtN(b.count)}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="stats-card-note">
            Current population: median {s.stay.currentMedianDaysHeld ?? '—'} days held so far,
            longest {s.stay.currentLongestDaysHeld ?? '—'} days.
          </div>
        </div>
        <div className="stats-card">
          <SectionTitle>Total bail (current population)</SectionTitle>
          <table className="stats-table">
            <tbody>
              <tr><td>With bail set</td><td className="stats-table-num">{fmtN(s.bond.withBond)}</td></tr>
              <tr><td>No bail / $0</td><td className="stats-table-num">{fmtN(s.bond.noBond)}</td></tr>
              <tr><td>Median bail</td><td className="stats-table-num">{formatMoney(s.bond.medianBond) || '—'}</td></tr>
              <tr><td>Highest bail</td><td className="stats-table-num">{formatMoney(s.bond.maxBond) || '—'}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="stats-grid-2">
        <div className="stats-card">
          <SectionTitle>Age at booking</SectionTitle>
          <table className="stats-table">
            <tbody>
              {s.ages.groups.map(g => (
                <tr key={g.label}><td>{g.label}</td><td className="stats-table-num">{fmtN(g.count)}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="stats-card-note">Median age: {s.ages.median ?? '—'}</div>
        </div>
        <div className="stats-card">
          <SectionTitle>Sex</SectionTitle>
          <CountTable rows={s.sex} label="Sex" />
        </div>
      </div>
    </div>
  )
}

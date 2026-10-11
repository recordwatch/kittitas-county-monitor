import { useState, useEffect } from 'react'
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom'
import Header from './components/Header'
import StatBar from './components/StatBar'
import BookingCard from './components/BookingCard'
import HistoryLog from './components/HistoryLog'
import Stats from './components/Stats'
import { formatDate } from './format'

// All pages read the same static JSON files that the scraper commits.
function useData() {
  const [data, setData] = useState({ log: null, status: null })
  useEffect(() => {
    Promise.all([
      fetch('./data/change_log.json').then(r => r.json()),
      fetch('./data/status.json').then(r => r.json())
    ]).then(([log, status]) => setData({ log, status }))
  }, [])
  return data
}

function Nav() {
  const cls = ({ isActive }) => (isActive ? 'active' : '')
  return (
    <div className="filter-tabs">
      <NavLink to="/" end className={cls}>In Custody</NavLink>
      <NavLink to="/released" className={cls}>Released</NavLink>
      <NavLink to="/history" className={cls}>History</NavLink>
      <NavLink to="/stats" className={cls}>Stats</NavLink>
    </div>
  )
}

function Page({ search, setSearch, children }) {
  return (
    <>
      <div className="controls">
        {setSearch && (
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="search-input"
          />
        )}
        <Nav />
      </div>
      {children}
    </>
  )
}

function BookingList({ entries, groupBy }) {
  if (entries.length === 0) return <div className="empty">No records match your search.</div>

  const groups = []
  let current = null
  for (const e of entries) {
    const label = formatDate(e[groupBy])
    if (!current || current.label !== label) {
      current = { label, entries: [] }
      groups.push(current)
    }
    current.entries.push(e)
  }

  return (
    <div className="log">
      <div className="log-count">{entries.length} record{entries.length !== 1 ? 's' : ''}</div>
      {groups.map(g => (
        <div key={g.label}>
          <div className="date-separator">{g.label}</div>
          {g.entries.map(e => <BookingCard key={e.id} entry={e} />)}
        </div>
      ))}
    </div>
  )
}

// field: which timestamp to sort and group by (bookedAt or releasedAt).
function FilteredPage({ log, status, field }) {
  const [search, setSearch] = useState('')
  if (!log) return <Page><div className="loading">Loading records...</div></Page>

  const q = search.toLowerCase()
  const entries = log
    .filter(e => e.status === status && e.name.toLowerCase().includes(q))
    .sort((a, b) => (b[field] || '').localeCompare(a[field] || ''))

  return (
    <Page search={search} setSearch={setSearch}>
      <BookingList entries={entries} groupBy={field} />
    </Page>
  )
}

function HistoryPage({ log }) {
  const [search, setSearch] = useState('')
  return (
    <Page search={search} setSearch={setSearch}>
      {log ? <HistoryLog entries={log} search={search} /> : <div className="loading">Loading records...</div>}
    </Page>
  )
}

export default function App() {
  const { log, status } = useData()
  return (
    <HashRouter>
      <div className="app">
        <Header />
        {status && <StatBar status={status} />}
        <Routes>
          <Route path="/" element={<FilteredPage log={log} status="in_custody" field="bookedAt" />} />
          <Route path="/released" element={<FilteredPage log={log} status="released" field="releasedAt" />} />
          <Route path="/history" element={<HistoryPage log={log} />} />
          <Route path="/stats" element={<Page><Stats /></Page>} />
        </Routes>
      </div>
    </HashRouter>
  )
}

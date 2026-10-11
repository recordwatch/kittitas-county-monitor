import { formatDateTime } from '../format'

export default function StatBar({ status }) {
  return (
    <div className="statbar">
      <div className="stat">
        <div className="stat-num">{status.inCustody}</div>
        <div className="stat-label">Currently in custody</div>
      </div>
      <div className="stat">
        <div className="stat-num">{formatDateTime(status.lastUpdated)}</div>
        <div className="stat-label">Last updated</div>
      </div>
    </div>
  )
}

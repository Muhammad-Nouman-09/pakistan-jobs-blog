import Link from "next/link";
import { daysLeft, fmtDate, initials, isWebUrl } from "@/lib/util";

export function DeadlineLabel({ job }) {
  const d = daysLeft(job.deadline);
  if (d === null) return <span className="deadline-pill">Last date: not given</span>;
  if (d < 0) return <span className="deadline-pill closed">Last date: {fmtDate(job.deadline)} · closed</span>;
  return <span className="deadline-pill">Last date: {fmtDate(job.deadline)} · {d} {d === 1 ? "day" : "days"} left</span>;
}

export default function JobCard({ job: j }) {
  return (
    <article className="job-card">
      <div className="job-avatar">{initials(j.organization)}</div>
      <div style={{ minWidth: 0 }}>
        <h3><Link href={`/find-jobs?id=${j.id}`}>{j.title}</Link></h3>
        <p className="org">{j.organization}</p>
        <p className="job-meta">
          <span className="badge">{j.sector}</span>
          <span>{j.city || ""}, {j.province}</span>
          <span>{j.category}</span>
          <span>{j.vacancies} post{j.vacancies === 1 ? "" : "s"}</span>
          <span>{j.education}</span>
        </p>
        <DeadlineLabel job={j} />
      </div>
      <div className="job-actions">
        <Link className="btn btn-dark btn-small" href={`/find-jobs?id=${j.id}`}>View details</Link>
        {isWebUrl(j.applyUrl) && <a className="btn btn-green btn-small" href={j.applyUrl} target="_blank" rel="noopener noreferrer">Apply now</a>}
      </div>
    </article>
  );
}

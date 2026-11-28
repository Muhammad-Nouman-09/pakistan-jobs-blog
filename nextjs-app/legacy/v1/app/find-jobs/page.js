"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import JobCard from "@/components/JobCard";
import useJobs, { byDeadline } from "@/components/useJobs";
import { daysLeft, fmtDate, isWebUrl, provinceMatches } from "@/lib/util";

const PROVINCES = ["All Pakistan", "Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Gilgit-Baltistan",
  "Azad Jammu & Kashmir", "Islamabad", "Islamabad Capital Territory"];

function Detail({ job: j }) {
  const plural = j.vacancies === 1 ? "" : "s";
  return (
    <div className="detail">
      <p><Link href="/find-jobs">← Back to all jobs</Link></p>
      <h2>{j.title}</h2>
      <p className="muted">{j.organization} · {j.city || ""}, {j.province} · {j.sector}</p>
      <table><tbody>
        <tr><th>Vacancies</th><td>{j.vacancies} post{plural}</td></tr>
        <tr><th>Pay scale</th><td>{j.salary}</td></tr>
        <tr><th>Education</th><td>{j.education}</td></tr>
        {j.experience && <tr><th>Experience</th><td>{j.experience}</td></tr>}
        <tr><th>Posted</th><td>{fmtDate(j.postedDate)}</td></tr>
        <tr><th>Last date</th><td>{fmtDate(j.deadline)}</td></tr>
        <tr><th>Source</th><td>{j.source}</td></tr>
      </tbody></table>
      <p>{j.description}</p>
      <h3>Posts and requirements</h3><p>{j.requirements}</p>
      <h3>How to apply</h3><p>{j.howToApply}</p>
      <p>{isWebUrl(j.applyUrl)
        ? <a className="btn btn-green" href={j.applyUrl} target="_blank" rel="noopener noreferrer">Apply on the official portal</a>
        : "See the official advertisement for the apply link."}</p>
      <p className="notice">No agent, no fees — apply only on the official portal above. Always confirm the deadline and eligibility in the official ad before applying.</p>
    </div>
  );
}

function FindJobs() {
  const sp = useSearchParams();
  const jobs = useJobs();
  const [sector, setSector] = useState(sp.get("sector") || "All");
  const [province, setProvince] = useState(sp.get("province") || "All Pakistan");
  const [category, setCategory] = useState(sp.get("category") || "All");
  const [query, setQuery] = useState((sp.get("q") || "").trim().toLowerCase());
  const id = sp.get("id");

  const pubs = jobs || [];
  const list = pubs
    .filter((j) => sector === "All" || j.sector === sector)
    .filter((j) => provinceMatches(j, province))
    .filter((j) => category === "All" || j.category === category)
    .filter((j) => !query || `${j.title} ${j.organization} ${j.category} ${j.city || ""}`.toLowerCase().includes(query))
    .sort(byDeadline);
  const detail = id && pubs.find((j) => String(j.id) === id);
  const cats = [...new Set(pubs.map((j) => j.category))];

  useEffect(() => { if (detail) document.querySelector(".detail")?.scrollIntoView({ behavior: "smooth" }); }, [detail]);

  return (
    <main className="section">
      <div className="container">
        <h1>Find Jobs</h1>
        <p className="sub">Search the live listings — every ad checked against the official advertisement.</p>
        <div className="find-layout">
          <div>
            <div className="controls">
              <input type="search" defaultValue={query} onChange={(e) => setQuery(e.target.value.trim().toLowerCase())}
                placeholder="Search jobs — teacher, police, BPS-11…" aria-label="Search jobs" />
            </div>
            <div className="controls tabs">
              {[["All", "All jobs"], ["Government", "Government"], ["Private", "Private"]].map(([v, label]) => (
                <button key={v} className={sector === v ? "active" : undefined} onClick={() => setSector(v)}>{label}</button>
              ))}
            </div>
            <div className="controls">
              <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
                <option value="All">All categories</option>
                {cats.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select value={province} onChange={(e) => setProvince(e.target.value)} aria-label="Province">
                {PROVINCES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <p className="muted">{list.length} {list.length === 1 ? "job" : "jobs"} found</p>
            <div className="job-grid">
              {list.length ? list.map((j) => <JobCard key={j.id} job={j} />)
                : jobs && <p>No jobs match that search yet. Try a different word or clear a filter.</p>}
            </div>
            {detail && <div id="detail"><Detail job={detail} /></div>}
          </div>
          <aside className="sidebar">
            <h3>Closing soon</h3>
            <p className="muted">Earliest deadline first.</p>
            <ul>
              {pubs.slice().sort(byDeadline).map((j) => {
                const d = daysLeft(j.deadline);
                return (
                  <li key={j.id}>
                    <Link href={`/find-jobs?id=${j.id}`}>{j.title}</Link><br />
                    <span className="d">{d === null ? "" : d < 0 ? `Closed ${fmtDate(j.deadline)}` : `Closes ${fmtDate(j.deadline)} (${d} days left)`}</span>
                  </li>
                );
              })}
            </ul>
            <p className="notice" style={{ marginTop: 16 }}><strong>Stay safe:</strong> never pay anyone for a job. Apply only on the official portal linked in the job.</p>
          </aside>
        </div>
      </div>
    </main>
  );
}

export default function Page() {
  return <Suspense fallback={<main className="section"><div className="container"><p>Loading…</p></div></main>}><FindJobs /></Suspense>;
}

"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import JobCard from "@/components/JobCard";
import useJobs, { byDeadline } from "@/components/useJobs";

export default function Home() {
  const router = useRouter();
  const jobs = useJobs();
  const [q, setQ] = useState("");
  const pubs = jobs || [];
  const soon = pubs.slice().sort(byDeadline).slice(0, 3);
  const cats = [...new Set(pubs.map((j) => j.category))];
  const search = () => router.push("/find-jobs" + (q.trim() ? "?q=" + encodeURIComponent(q.trim()) : ""));

  return (
    <main>
      <section className="hero">
        <div className="hero-inner">
          <h1>The <span className="accent">Job Board</span><br />to Find Government &amp; Private Jobs in Pakistan</h1>
          <p className="lead">Every open ad from <b>FPSC, PPSC, NTS</b>, the <b>National Job Portal</b> and Pakistan&apos;s newspapers — checked by hand, with the <b>real last date</b> and a direct link to the official application. No agents, no fees, no middlemen.</p>
          <p className="hero-label">Looking for <span className="accent">Work?</span></p>
          <div className="search-pill">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="Search jobs — teacher, police, BPS-11…" aria-label="Search jobs" />
            <button className="btn btn-dark" type="button" onClick={search}>SEARCH</button>
          </div>
          <p className="hero-hint">Searching takes you to the Find Jobs page with all live listings.</p>
          <p className="hero-label">Hiring or sharing a vacancy? <span className="accent">Post it here</span></p>
          <div className="post-pill">
            <input type="text" placeholder="Add a government or private job…" aria-label="Post a job" readOnly onClick={() => router.push("/admin")} />
            <button className="btn btn-green" type="button" onClick={() => router.push("/admin")}>POST A JOB</button>
          </div>
          <div className="stats">
            <div className="stat"><b>{pubs.length}</b><span>live job ads</span></div>
            <div className="stat"><b>{pubs.reduce((s, j) => s + (j.vacancies || 0), 0)}</b><span>total vacancies</span></div>
            <div className="stat"><b>{pubs.filter((j) => j.sector === "Government").length}</b><span>government ads</span></div>
          </div>
        </div>
        <div className="hero-cards">{soon.map((j) => <JobCard key={j.id} job={j} />)}</div>
      </section>

      <section className="section section-soft">
        <div className="container">
          <h2>How It Works</h2>
          <p className="sub">Find a job, check the official ad, apply on the official portal — in three steps.</p>
          <div className="steps">
            <div className="step"><div className="num">1</div><h3>Search jobs</h3><p>Search the live listings, or browse by category, province and sector — Government or Private.</p></div>
            <div className="step"><div className="num">2</div><h3>Check the official ad</h3><p>Every listing shows the real last date, eligibility and a link to the official advertisement or portal. Always confirm it there before you apply.</p></div>
            <div className="step"><div className="num">3</div><h3>Apply — no agent, no fee</h3><p>Apply directly on the official portal. Nobody from this blog will ever ask you to pay for a job.</p></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>Browse by category</h2>
          <p className="sub">Categories used by the live listings right now.</p>
          <div className="pills">
            {cats.map((c) => <Link key={c} className="pill" href={`/find-jobs?category=${encodeURIComponent(c)}`}>{c}</Link>)}
            <Link className="pill" href="/find-jobs">See all jobs →</Link>
          </div>
        </div>
      </section>

      <section className="section section-soft">
        <div className="container">
          <h2>Latest jobs</h2>
          <p className="sub">The soonest-closing live ads first. <Link href="/find-jobs">See all jobs →</Link></p>
          <div className="job-grid">
            {jobs && !soon.length ? <p>No live jobs right now.</p> : soon.map((j) => <JobCard key={j.id} job={j} />)}
          </div>
          <p className="notice" style={{ marginTop: 20 }}><strong>Stay safe:</strong> No government department asks for money through an agent, JazzCash or WhatsApp to give you a job. If someone asks for a fee, walk away and apply only on the official portal linked in the job.</p>
        </div>
      </section>
    </main>
  );
}

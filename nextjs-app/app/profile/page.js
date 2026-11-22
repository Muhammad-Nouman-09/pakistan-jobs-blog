"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { api, cvCompleteness, cvText } from "@/lib/util";

const FIELDS = ["name", "headline", "summary", "education", "experience", "skills", "languages",
  "city", "province", "phone", "companyName", "companyAbout", "website"];
const PROVINCES = ["Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Gilgit-Baltistan",
  "Azad Jammu & Kashmir", "Islamabad Capital Territory", "All Pakistan"];

export default function Profile() {
  const { user: me, loading, setUser } = useAuth();
  const [form, setForm] = useState({});
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (me) setForm(Object.fromEntries(FIELDS.map((f) => [f, me[f] || ""])));
  }, [me]);

  if (loading) return <main className="section"><div className="container"><p>Loading…</p></div></main>;
  if (!me) {
    return <main className="section"><div className="container"><p className="notice warn">Please <Link href="/auth">sign in</Link> to see your profile.</p></div></main>;
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const draft = { ...me, ...form };
  const pct = cvCompleteness(draft);
  const preview = cvText(draft);
  const isSeeker = me.role === "seeker";

  async function save(e) {
    e.preventDefault();
    try {
      const { user } = await api("/api/profile", { method: "PATCH", body: form });
      setUser(user);
      setMsg("Profile saved.");
    } catch (err) { setMsg(err.message); }
  }
  function download() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([preview], { type: "text/plain" }));
    a.download = "my-cv.txt"; a.click();
  }

  const roleText = me.role === "admin" ? "Admin — complete access"
    : me.role === "employer" ? "Employer — " + (me.status === "pending" ? "pending admin verification, cannot post jobs yet" : "verified, you can post jobs")
    : "Job Seeker — active";

  return (
    <main className="section">
      <div className="container">
        <h1>Profile — {me.name}</h1>
        <p className="muted">{roleText}</p>
        {me.role === "employer" && (me.status === "active"
          ? <p><Link className="btn btn-dark" href="/admin">Go to My Jobs — post, edit or manage your jobs</Link></p>
          : <p className="muted">Your employer account is pending verification. Once an admin verifies you, your My Jobs page will appear here.</p>)}
        <form onSubmit={save}>
          <div className="form-card" style={{ maxWidth: "100%" }}>
            <h2>About you</h2>
            <label>Full name *</label><input value={form.name || ""} onChange={set("name")} required />
            <label>City</label><input value={form.city || ""} onChange={set("city")} placeholder="e.g. Lahore" />
            <label>Province</label>
            <select value={form.province || ""} onChange={set("province")}>
              <option value="">—</option>{PROVINCES.map((p) => <option key={p}>{p}</option>)}
            </select>
            <label>Phone</label><input value={form.phone || ""} onChange={set("phone")} placeholder="Optional" />
            <label>Company / organisation (employers)</label><input value={form.companyName || ""} onChange={set("companyName")} placeholder="e.g. ABC Textiles (Pvt) Ltd" />
            <label>About the company (employers)</label><textarea value={form.companyAbout || ""} onChange={set("companyAbout")} placeholder="What does your company do?" />
            <label>Website</label><input value={form.website || ""} onChange={set("website")} placeholder="https://…" />
          </div>

          {isSeeker && (
            <div className="form-card" style={{ maxWidth: "100%", marginTop: 24 }}>
              <h2>My CV / Resume</h2>
              <p className="muted">For job seekers. Fill in what you can — the preview updates live.</p>
              <label>Headline</label><input value={form.headline || ""} onChange={set("headline")} placeholder="e.g. Matric pass, looking for clerical work in Quetta" />
              <label>Summary</label><textarea value={form.summary || ""} onChange={set("summary")} placeholder="Two or three sentences about you." />
              <label>Education</label><textarea value={form.education || ""} onChange={set("education")} placeholder="e.g. Matric, 2023 — Govt High School, Quetta" />
              <label>Experience</label><textarea value={form.experience || ""} onChange={set("experience")} placeholder="Jobs, internships or practical work, with dates." />
              <label>Skills</label><input value={form.skills || ""} onChange={set("skills")} placeholder="e.g. Typing 30 wpm, MS Office, driving licence" />
              <label>Languages</label><input value={form.languages || ""} onChange={set("languages")} placeholder="e.g. Urdu, English, Balochi" />
              <p><b>Completeness: {pct}% complete</b></p>
              <div className="meter"><div style={{ width: pct + "%" }} /></div>
              <h3 style={{ marginTop: 20 }}>Live preview</h3>
              <div className="cv-preview">{preview}</div>
              <p style={{ marginTop: 12 }}>
                <button className="btn btn-outline" type="button" onClick={() => { navigator.clipboard?.writeText(preview); setMsg("CV copied to clipboard."); }}>Copy CV</button>{" "}
                <button className="btn btn-outline" type="button" onClick={download}>Download CV (.txt)</button>
              </p>
            </div>
          )}

          <p style={{ marginTop: 20 }}><button className="btn btn-dark" type="submit">Save profile</button></p>
          <p>{msg}</p>
        </form>
      </div>
    </main>
  );
}

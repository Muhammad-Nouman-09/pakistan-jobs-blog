"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/util";

const TEXT_FIELDS = ["title", "organization", "sector", "category", "city", "province", "salary", "education",
  "experience", "postedDate", "deadline", "description", "requirements", "howToApply", "applyUrl", "source"];
const PROVINCES = ["All Pakistan", "Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Gilgit-Baltistan",
  "Azad Jammu & Kashmir", "Islamabad", "Islamabad Capital Territory"];
const EMPTY = { sector: "Government", province: "All Pakistan", vacancies: 1, featured: false };

function JobsTab({ isAdmin, me }) {
  const [jobs, setJobs] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => api("/api/jobs?scope=manage").then((d) => setJobs(d.jobs)).catch((e) => setMsg({ ok: false, text: e.message })), []);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const field = (k, props = {}) => <input value={form[k] ?? ""} onChange={set(k)} {...props} />;
  const area = (k, placeholder) => <textarea value={form[k] ?? ""} onChange={set(k)} placeholder={placeholder} />;

  async function submit(e) {
    e.preventDefault();
    try {
      await api(editingId ? `/api/jobs/${editingId}` : "/api/jobs", { method: editingId ? "PUT" : "POST", body: form });
      setEditingId(null); setForm(EMPTY); load();
      setMsg({ ok: true, text: "Job saved." });
    } catch (err) { setMsg({ ok: false, text: err.message }); }
  }
  async function act(fn) { try { await fn(); load(); } catch (err) { alert(err.message); } }

  return (
    <div>
      <h2>{editingId ? `Edit job — ${form.title}` : isAdmin ? "Post a job" : "Post a job — My Jobs"}</h2>
      <p className="muted">Admins post any job. Verified employers post under their own account and manage only their own jobs.</p>
      <form onSubmit={submit}>
        <label>Job title *</label>{field("title", { required: true, placeholder: "e.g. Punjab Police Constable Jobs 2026 — 500 Posts" })}
        <label>Organisation *</label>{field("organization", { required: true, placeholder: "e.g. Punjab Police" })}
        <label>Sector</label>
        <select value={form.sector} onChange={set("sector")}><option>Government</option><option>Private</option></select>
        <label>Category</label>{field("category", { placeholder: "e.g. Police / Teaching / Engineering" })}
        <label>City</label>{field("city", { placeholder: "e.g. Lahore" })}
        <label>Province</label>
        <select value={form.province} onChange={set("province")}>{PROVINCES.map((p) => <option key={p}>{p}</option>)}</select>
        <label>Vacancies *</label>{field("vacancies", { type: "number", min: 1 })}
        <label>Pay scale / salary</label>{field("salary", { placeholder: "e.g. BPS-07, as per government pay scales" })}
        <label>Education</label>{field("education", { placeholder: "e.g. Matric, Intermediate, Bachelor's — post-wise" })}
        <label>Experience</label>{field("experience", { placeholder: "e.g. 3 years' experience as a typist" })}
        <label>Posted date</label>{field("postedDate", { type: "date" })}
        <label>Last date to apply *</label>{field("deadline", { type: "date", required: true })}
        <label>Short description</label>{area("description", "One or two plain sentences: who is hiring, for what, and the key condition.")}
        <label>Posts and requirements</label>{area("requirements", "Post-wise titles, counts, age, quota, qualifications.")}
        <label>How to apply</label>{area("howToApply", "Official portal only. No agent, no hard copy, unless the ad says so.")}
        <label>Official apply link</label>{field("applyUrl", { type: "url", placeholder: "https://… (official portal only — must start with http:// or https://)" })}
        <label>Source (where you verified it)</label>{field("source", { placeholder: "e.g. Official ad, Jang 10 Nov 2026, via fpsc.gov.pk" })}
        {isAdmin && <p><label><input type="checkbox" checked={!!form.featured} onChange={set("featured")} /> Featured (admin only)</label></p>}
        <p>
          <button className="btn btn-dark" type="submit">{editingId ? "Save changes" : "Publish job"}</button>{" "}
          {editingId && <button className="btn" type="button" onClick={() => { setEditingId(null); setForm(EMPTY); }}>Cancel</button>}
        </p>
        {msg && <p className={msg.ok ? "success" : "error"}>{msg.text}</p>}
      </form>

      <h2 style={{ marginTop: 32 }}>{isAdmin ? "All jobs" : "My jobs"}</h2>
      {jobs.length ? jobs.map((j) => (
        <div className="admin-row" key={j.id}>
          <div><b>{j.id}. {j.title}</b><br />
            <span className="muted">{j.vacancies} posts · closes {j.deadline || "—"} · {j.status}{j.featured ? " · Featured" : ""}{j.employerId ? ` · employer #${j.employerId}` : ""}</span></div>
          <div>
            <button className="btn btn-small" onClick={() => { setEditingId(j.id); setForm({ ...EMPTY, ...j }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>{" "}
            <button className="btn btn-small" onClick={() => act(() => api(`/api/jobs/${j.id}`, { method: "PUT", body: { status: j.status === "published" ? "draft" : "published" } }))}>{j.status === "published" ? "Unpublish" : "Publish"}</button>{" "}
            <button className="btn btn-small btn-danger" onClick={() => confirm("Delete this job?") && act(() => api(`/api/jobs/${j.id}`, { method: "DELETE" }))}>Delete</button>
          </div>
        </div>
      )) : <p>No jobs here yet.</p>}
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState([]);
  const load = useCallback(() => api("/api/users").then((d) => setUsers(d.users)), []);
  useEffect(() => { load(); }, [load]);
  const act = async (fn) => { try { await fn(); load(); } catch (e) { alert(e.message); } };
  const setStatus = (id, status) => act(() => api(`/api/users/${id}`, { method: "PATCH", body: { status } }));
  return (
    <div>
      <h2>Users &amp; Verification</h2>
      <p className="muted">Employers register as <b>pending</b> and cannot post until an admin verifies them here. Admin only.</p>
      <p className="muted">{users.length} user(s) · {users.filter((u) => u.role === "employer" && u.status === "pending").length} employer(s) waiting for verification</p>
      {users.map((u) => (
        <div className="admin-row" key={u.id}>
          <div><b>{u.name}</b> · {u.email}<br /><span className="muted">{u.role} · {u.status}{u.companyName ? " · " + u.companyName : ""}</span></div>
          <div>
            {u.status === "pending" && <button className="btn btn-green btn-small" onClick={() => setStatus(u.id, "active")}>Verify</button>}{" "}
            {u.status === "active" && u.role !== "admin" && <button className="btn btn-small" onClick={() => setStatus(u.id, "suspended")}>Suspend</button>}{" "}
            {u.status === "suspended" && <button className="btn btn-small" onClick={() => setStatus(u.id, "active")}>Reactivate</button>}{" "}
            {u.role !== "admin" && <button className="btn btn-small btn-danger" onClick={() => confirm("Delete this user? Their jobs stay live but become unassigned.") && act(() => api(`/api/users/${u.id}`, { method: "DELETE" }))}>Delete</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

function MessagesTab() {
  const [msgs, setMsgs] = useState([]);
  const load = useCallback(() => api("/api/messages").then((d) => setMsgs(d.messages)), []);
  useEffect(() => { load(); }, [load]);
  const act = async (fn) => { try { await fn(); load(); } catch (e) { alert(e.message); } };
  return (
    <div>
      <h2>Messages</h2>
      <p className="muted">Messages sent through the Contact Us form. Admin only.</p>
      {msgs.length ? msgs.map((m) => (
        <div className={"msg " + (m.read ? "" : "unread")} key={m.id}>
          <b>{m.subject || "(no subject)"}</b> — {m.name} &lt;{m.email}&gt;<br />
          <span className="muted">{m.createdAt} · {m.read ? "Read" : "Unread"}</span>
          <p>{m.message}</p>
          <p>
            <a className="btn btn-small" href={`mailto:${m.email}?subject=${encodeURIComponent("Re: " + (m.subject || "Pakistan Jobs Blog"))}`}>Reply by email</a>{" "}
            <button className="btn btn-small" onClick={() => act(() => api(`/api/messages/${m.id}`, { method: "PATCH", body: { read: !m.read } }))}>Mark {m.read ? "unread" : "read"}</button>{" "}
            <button className="btn btn-small btn-danger" onClick={() => confirm("Delete this message?") && act(() => api(`/api/messages/${m.id}`, { method: "DELETE" }))}>Delete</button>
          </p>
        </div>
      )) : <p>No contact messages yet.</p>}
    </div>
  );
}

function AdsenseTab() {
  const [ads, setAds] = useState(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { api("/api/settings").then((d) => setAds(d.adsense)); }, []);
  if (!ads) return <p>Loading…</p>;
  const setSlot = (k) => (e) => setAds((a) => ({ ...a, slots: { ...a.slots, [k]: e.target.value } }));
  async function save(e) {
    e.preventDefault();
    try { await api("/api/settings", { method: "PUT", body: ads }); setMsg("AdSense settings saved."); }
    catch (err) { setMsg(err.message); }
  }
  return (
    <div>
      <h2>AdSense &amp; Settings</h2>
      <p className="muted">Paste <b>your own</b> AdSense Publisher ID and slot IDs. Leave them empty until you have them.</p>
      <form onSubmit={save}>
        <label>Publisher ID</label><input value={ads.publisherId} onChange={(e) => setAds({ ...ads, publisherId: e.target.value })} placeholder="ca-pub-… (leave empty until you have one)" />
        <p><label><input type="checkbox" checked={ads.enabled} onChange={(e) => setAds({ ...ads, enabled: e.target.checked })} /> Ads enabled</label></p>
        <label>Top banner slot ID</label><input value={ads.slots.topBanner} onChange={setSlot("topBanner")} />
        <label>In-feed slot ID</label><input value={ads.slots.inFeed} onChange={setSlot("inFeed")} />
        <label>In-article slot ID</label><input value={ads.slots.inArticle} onChange={setSlot("inArticle")} />
        <label>Sidebar slot ID</label><input value={ads.slots.sidebar} onChange={setSlot("sidebar")} />
        <p><button className="btn btn-dark" type="submit">Save AdSense settings</button></p>
        <p>{msg}</p>
      </form>
    </div>
  );
}

export default function Admin() {
  const { user: me, loading } = useAuth();
  const [tab, setTab] = useState("jobs");

  let gate = null;
  if (loading) gate = <p>Loading…</p>;
  else if (!me) gate = <p className="notice warn">Please <Link href="/auth">sign in</Link> to use the Admin Panel. Job seekers cannot post jobs from here.</p>;
  else if (me.role === "seeker") gate = <p className="notice warn">Job seekers cannot post jobs. Your profile and CV are on the <Link href="/profile">Profile</Link> page.</p>;
  else if (me.role === "employer" && me.status === "pending") gate = <p className="notice warn">Your employer account is pending verification. An admin must verify you before you can post jobs.</p>;

  const isAdmin = me?.role === "admin";
  const tabs = [["jobs", "Jobs"], ...(isAdmin ? [["users", "Users & Verification"], ["messages", "Messages"], ["adsense", "AdSense & Settings"]] : [])];

  return (
    <main className="section">
      <div className="container">
        <h1>Admin Panel</h1>
        {gate || (
          <>
            <p className="muted">{isAdmin ? `Signed in as ${me.name} (Admin — complete access)` : `Signed in as ${me.name} (Verified employer — your jobs only)`}</p>
            <div className="admin-tabs">
              {tabs.map(([k, label]) => <button key={k} className={tab === k ? "active" : undefined} onClick={() => setTab(k)}>{label}</button>)}
            </div>
            {tab === "jobs" && <JobsTab isAdmin={isAdmin} me={me} />}
            {tab === "users" && isAdmin && <UsersTab />}
            {tab === "messages" && isAdmin && <MessagesTab />}
            {tab === "adsense" && isAdmin && <AdsenseTab />}
          </>
        )}
        <p style={{ marginTop: 24 }}><Link href="/">← Back to the blog</Link></p>
      </div>
    </main>
  );
}

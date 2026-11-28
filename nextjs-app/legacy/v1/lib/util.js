export function daysLeft(deadline) {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline + "T23:59:59") - new Date()) / 86400000);
}
export function fmtDate(s) {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
export function initials(org) {
  const words = String(org || "").replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]).join("") || "PJ").toUpperCase();
}
export const isWebUrl = (u) => /^https?:\/\//i.test(String(u || "").trim());

export function provinceMatches(j, p) {
  if (!p || p === "All Pakistan") return true;
  if (j.province === "All Pakistan") return true; // nationwide ad shows in every province
  if (p === "Islamabad") return j.province === "Islamabad Capital Territory" || j.province === "Islamabad" || j.city === "Islamabad";
  return j.province === p;
}

export function cvText(u) {
  return [u.name || "", u.headline || "", "", u.summary || "", "",
    "Education", u.education || "—", "", "Experience", u.experience || "—", "",
    "Skills", u.skills || "—", "", "Languages", u.languages || "—", "",
    "Contact", [u.email, u.phone, u.city, u.province].filter(Boolean).join(" · ")].join("\n");
}
export function cvCompleteness(u) {
  const f = ["headline", "summary", "education", "experience", "skills", "languages"];
  return Math.round((f.filter((k) => (u[k] || "").trim()).length / f.length) * 100);
}

export async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

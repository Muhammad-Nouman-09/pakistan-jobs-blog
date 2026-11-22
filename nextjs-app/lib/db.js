// Storage layer. Serverless functions have no persistent disk, so production
// uses Upstash Redis (REST). Local dev falls back to a JSON file in .data/.
import { Redis } from "@upstash/redis";
import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import seedJobs from "@/data/jobs.json";

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;
const FILE = path.join(process.cwd(), ".data", "db.json");

async function readFileDb() {
  try { return JSON.parse(await fs.readFile(FILE, "utf8")); } catch { return {}; }
}

async function get(key) {
  if (redis) return (await redis.get(key)) ?? null;
  if (process.env.VERCEL) throw new Error("No database configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
  const db = await readFileDb();
  return db[key] ?? null;
}

async function set(key, value) {
  if (redis) { await redis.set(key, value); return; }
  if (process.env.VERCEL) throw new Error("No database configured.");
  const db = await readFileDb();
  db[key] = value;
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(db, null, 2));
}

export async function getJobs() {
  let jobs = await get("jobs");
  if (!jobs) { jobs = seedJobs; await set("jobs", jobs); }
  return jobs;
}
export const saveJobs = (jobs) => set("jobs", jobs);

export const blankProfile = {
  companyName: "", companyAbout: "", website: "", phone: "", headline: "", summary: "",
  education: "", experience: "", skills: "", languages: "", city: "", province: ""
};

export async function getUsers() {
  const users = (await get("users")) || [];
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (email && password && !users.some((u) => u.role === "admin")) {
    users.push({
      ...blankProfile, id: Math.max(0, ...users.map((u) => u.id)) + 1, name: "Site Admin", email,
      role: "admin", status: "active", companyName: "Pakistan Jobs Blog",
      passwordHash: await bcrypt.hash(password, 10)
    });
    await set("users", users);
  }
  return users;
}
export const saveUsers = (users) => set("users", users);

export async function getMessages() { return (await get("messages")) || []; }
export const saveMessages = (m) => set("messages", m);

const defaultAds = { publisherId: "", enabled: false, slots: { topBanner: "", inFeed: "", inArticle: "", sidebar: "" } };
export async function getAdsense() { return (await get("adsense")) || defaultAds; }
export const saveAdsense = (a) => set("adsense", a);

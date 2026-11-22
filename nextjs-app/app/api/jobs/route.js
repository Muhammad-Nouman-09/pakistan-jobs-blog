import { getJobs, saveJobs } from "@/lib/db";
import { getSessionUser, requireUser, json, fail } from "@/lib/auth";
import { cleanJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";

// GET /api/jobs            -> public, published jobs only
// GET /api/jobs?scope=manage -> admin: all jobs; employer: own jobs
export async function GET(req) {
  const jobs = await getJobs();
  if (new URL(req.url).searchParams.get("scope") === "manage") {
    const me = await getSessionUser();
    if (!me) return fail("Please sign in.", 401);
    if (me.role === "admin") return json({ jobs });
    if (me.role === "employer" && me.status === "active") return json({ jobs: jobs.filter((j) => j.employerId === me.id) });
    return fail("Not allowed.", 403);
  }
  return json({ jobs: jobs.filter((j) => j.status === "published") });
}

export async function POST(req) {
  const { user, response } = await requireUser(["admin", "employer"]);
  if (response) return response;
  const { job, error } = cleanJob(await req.json().catch(() => ({})), null, user);
  if (error) return fail(error);
  const jobs = await getJobs();
  job.id = Math.max(0, ...jobs.map((j) => j.id)) + 1;
  job.status = "published";
  jobs.unshift(job);
  await saveJobs(jobs);
  return json({ job }, 201);
}

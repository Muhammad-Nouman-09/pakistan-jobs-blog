import { getJobs, saveJobs } from "@/lib/db";
import { requireUser, json, fail } from "@/lib/auth";
import { cleanJob, canManage } from "@/lib/jobs";

async function load(params) {
  const id = Number((await params).id);
  const jobs = await getJobs();
  return { jobs, index: jobs.findIndex((j) => j.id === id) };
}

// PUT: full edit, or { status: "published" | "draft" } to publish/unpublish.
export async function PUT(req, { params }) {
  const { user, response } = await requireUser(["admin", "employer"]);
  if (response) return response;
  const { jobs, index } = await load(params);
  if (index < 0) return fail("Job not found.", 404);
  const existing = jobs[index];
  if (!canManage(user, existing)) return fail("You can only change your own jobs.", 403);
  const b = await req.json().catch(() => ({}));
  if (Object.keys(b).length === 1 && "status" in b) {
    if (!["published", "draft"].includes(b.status)) return fail("Invalid status.");
    jobs[index] = { ...existing, status: b.status };
  } else {
    const { job, error } = cleanJob(b, existing, user);
    if (error) return fail(error);
    jobs[index] = job;
  }
  await saveJobs(jobs);
  return json({ job: jobs[index] });
}

export async function DELETE(_req, { params }) {
  const { user, response } = await requireUser(["admin", "employer"]);
  if (response) return response;
  const { jobs, index } = await load(params);
  if (index < 0) return fail("Job not found.", 404);
  if (!canManage(user, jobs[index])) return fail("You can only delete your own jobs.", 403);
  jobs.splice(index, 1);
  await saveJobs(jobs);
  return json({ ok: true });
}

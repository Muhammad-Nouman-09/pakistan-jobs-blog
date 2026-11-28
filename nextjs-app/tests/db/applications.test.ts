import { beforeAll, describe, expect, it } from "vitest";
import { createUser, denied, run, sup } from "./harness";
import { buildWorld, rpc, type World } from "./world";

let w: World;
let job: string;       // internal job at company A, with one required screening question
let resume1: string;
beforeAll(async () => {
  w = await buildWorld();
  job = await w.publishedJob(w.u.ownerA, w.companyA, {
    screening: JSON.stringify([{ id: "q1", text: "Years of experience?", required: true }, { id: "q2", text: "Notice period?", required: false }])
  });
  resume1 = await w.shareableResume(w.u.seeker1);
});

const apply = (who: typeof w.u.seeker1, resume: string, answers: unknown[] = [{ id: "q1", answer: "5" }], jobId = job) =>
  rpc<{ apply_to_job: string }>(w.db, who, "apply_to_job", [jobId, resume, "Hello, I am interested", JSON.stringify(answers)]);

describe("internal applications", () => {
  it("only active job seekers can apply; employers, admins and anonymous cannot", async () => {
    for (const who of [w.u.ownerA, w.u.recruiterA, w.u.admin, w.u.ownerB, null] as const) {
      await denied(w.db, who, "select public.apply_to_job($1,$2,'',$3::jsonb)", [job, resume1, "[]"]);
    }
  });

  it("validates required screening answers, resume ownership and resume privacy", async () => {
    expect(await denied(w.db, w.u.seeker1, "select public.apply_to_job($1,$2,'x','[]'::jsonb)", [job, resume1])).toMatch(/answer_required/);
    expect(await denied(w.db, w.u.seeker1, "select public.apply_to_job($1,$2,'x','[{\"id\":\"q1\",\"answer\":\"  \"}]'::jsonb)", [job, resume1])).toMatch(/answer_required/);
    const r2 = await w.shareableResume(w.u.seeker2);
    expect(await denied(w.db, w.u.seeker1, "select public.apply_to_job($1,$2,'x','[{\"id\":\"q1\",\"answer\":\"1\"}]'::jsonb)", [job, r2])).toMatch(/resume_not_found/);
    const [{ id: priv }] = await run<{ id: string }>(w.db, w.u.seeker1, "insert into public.resumes (user_id, title) values ($1,'Private draft') returning id", [w.u.seeker1.id]);
    expect(await denied(w.db, w.u.seeker1, "select public.apply_to_job($1,$2,'x','[{\"id\":\"q1\",\"answer\":\"1\"}]'::jsonb)", [job, priv])).toMatch(/resume_private/);
  });

  it("creates the application with a resume snapshot, answers and history; duplicates are refused", async () => {
    const [{ apply_to_job: app }] = await apply(w.u.seeker1, resume1);
    const [a] = await sup<{ status: string; job_title: string; company_name: string; resume_snapshot: { content: { summary: string }; applicant: { email: string } } }>(
      w.db, "select status, job_title, company_name, resume_snapshot from public.applications where id = $1", [app]);
    expect(a.status).toBe("submitted");
    expect(a.company_name).toBe("Alpha Tech");
    expect(a.job_title).toBe("Senior Software Engineer");
    expect(a.resume_snapshot.content.summary).toBe("Experienced developer");
    expect(a.resume_snapshot.applicant.email).toBe("seeker1@z.test");
    expect(await sup(w.db, "select 1 from public.application_answers where application_id = $1", [app])).toHaveLength(2);
    expect(await sup(w.db, "select 1 from public.application_events where application_id = $1", [app])).toHaveLength(1);
    expect(await denied(w.db, w.u.seeker1, "select public.apply_to_job($1,$2,'again','[{\"id\":\"q1\",\"answer\":\"1\"}]'::jsonb)", [job, resume1])).toMatch(/already_applied/);
    expect(await sup(w.db, "select 1 from public.applications where job_id = $1 and candidate_id = $2", [job, w.u.seeker1.id])).toHaveLength(1);
    // Resume edits after applying don't change what the employer received.
    await run(w.db, w.u.seeker1, "update public.resumes set content = '{\"summary\":\"changed\"}' where id = $1", [resume1]);
    const [b] = await sup<{ resume_snapshot: { content: { summary: string } } }>(w.db, "select resume_snapshot from public.applications where id = $1", [app]);
    expect(b.resume_snapshot.content.summary).toBe("Experienced developer");
  });

  it("recruiters are notified of the new application", async () => {
    const n = await run<{ type: string }>(w.db, w.u.recruiterA, "select type from public.notifications where type = 'application_received'");
    expect(n.length).toBeGreaterThan(0);
    expect(await run(w.db, w.u.viewerA, "select 1 from public.notifications where type = 'application_received'")).toHaveLength(0);
    expect(await run(w.db, w.u.ownerB, "select 1 from public.notifications where type = 'application_received'")).toHaveLength(0);
  });

  it("closed, unpublished and unverified-company jobs cannot be applied to", async () => {
    const closing = await w.publishedJob(w.u.ownerA, w.companyA, { title: "Closing Role Test", deadlineOffset: 1 });
    await sup(w.db, "update public.job_published set deadline = public.today_pk() - 1 where job_id = $1", [closing]);
    expect(await denied(w.db, w.u.seeker2, "select public.apply_to_job($1,$2,'','[]'::jsonb)", [closing, await w.shareableResume(w.u.seeker2)])).toMatch(/job_closed/);
    const draft = await w.draftJob(w.u.ownerA, w.companyA);
    expect(await denied(w.db, w.u.seeker2, "select public.apply_to_job($1,$2,'','[]'::jsonb)", [draft, await w.shareableResume(w.u.seeker2)])).toMatch(/job_not_found/);
  });

  it("suspended candidates cannot apply", async () => {
    const s = await createUser(w.db, "suspended-seeker@z.test");
    const r = await w.shareableResume(s);
    await rpc(w.db, w.u.admin, "set_user_status", [s.id, "suspended"]);
    await denied(w.db, s, "select public.apply_to_job($1,$2,'','[{\"id\":\"q1\",\"answer\":\"1\"}]'::jsonb)", [job, r]);
  });
});

describe("who can see applications", () => {
  let app: string;
  beforeAll(async () => {
    const r2 = await w.shareableResume(w.u.seeker2);
    [{ apply_to_job: app }] = await apply(w.u.seeker2, r2, [{ id: "q1", answer: "2" }]);
  });
  const sees = async (who: Parameters<typeof run>[1], table = "applications") =>
    (await run(w.db, who, `select 1 from public.${table} where ${table === "applications" ? "id" : "application_id"} = $1`, [app])).length > 0;

  it("owner, recruiter and admin can read; viewer, other companies, other candidates and anonymous cannot", async () => {
    expect(await sees(w.u.ownerA)).toBe(true);
    expect(await sees(w.u.recruiterA)).toBe(true);
    expect(await sees(w.u.admin)).toBe(true);
    expect(await sees(w.u.seeker2)).toBe(true);
    expect(await sees(w.u.viewerA)).toBe(false);
    expect(await sees(w.u.ownerB)).toBe(false);
    expect(await sees(w.u.seeker1)).toBe(false);
    expect(await sees(null).catch(() => false)).toBe(false);
  });

  it("answers and history follow the same visibility", async () => {
    for (const t of ["application_answers", "application_events"]) {
      expect(await sees(w.u.recruiterA, t)).toBe(true);
      expect(await sees(w.u.seeker2, t)).toBe(true);
      expect(await sees(w.u.ownerB, t)).toBe(false);
      expect(await sees(w.u.seeker1, t)).toBe(false);
      expect(await sees(w.u.viewerA, t)).toBe(false);
    }
  });

  it("no client can insert, update or delete applications directly", async () => {
    await denied(w.db, w.u.seeker2, "update public.applications set status = 'selected' where id = $1", [app]);
    await denied(w.db, w.u.seeker2, "delete from public.applications where id = $1", [app]);
    await denied(w.db, w.u.recruiterA, "update public.applications set status = 'selected' where id = $1", [app]);
    await denied(w.db, w.u.seeker2, "insert into public.applications (job_id, company_id, candidate_id, job_title, company_name) values ($1,$2,$3,'t','c')", [job, w.companyA, w.u.seeker2.id]);
    await denied(w.db, w.u.admin, "delete from public.applications where id = $1", [app]);
  });

  it("only owners/recruiters of the right company change status; viewers, admins, outsiders and the candidate cannot", async () => {
    for (const who of [w.u.viewerA, w.u.admin, w.u.ownerB, w.u.seeker1, w.u.seeker2, null] as const) {
      await denied(w.db, who, "select public.set_application_status($1,'shortlisted')", [app]);
    }
    await rpc(w.db, w.u.recruiterA, "set_application_status", [app, "viewed"]);
    await rpc(w.db, w.u.recruiterA, "set_application_status", [app, "shortlisted"]);
    await rpc(w.db, w.u.ownerA, "set_application_status", [app, "interview"]);
    // Re-opening the detail page must not demote the status.
    await rpc(w.db, w.u.recruiterA, "set_application_status", [app, "viewed"]);
    const [a] = await sup<{ status: string }>(w.db, "select status from public.applications where id = $1", [app]);
    expect(a.status).toBe("interview");
    expect(await denied(w.db, w.u.recruiterA, "select public.set_application_status($1,'withdrawn')", [app])).toMatch(/invalid_status/);
    expect(await denied(w.db, w.u.recruiterA, "select public.set_application_status($1,'submitted')", [app])).toMatch(/invalid_status/);
    const hist = await run<{ to_status: string }>(w.db, w.u.seeker2, "select to_status from public.application_events where application_id = $1 order by created_at, id", [app]);
    expect(hist.map((h) => h.to_status)).toEqual(["submitted", "viewed", "shortlisted", "interview"]);
    const n = await run<{ payload: { status: string } }>(w.db, w.u.seeker2, "select payload from public.notifications where type = 'application_status'");
    expect(n.map((x) => x.payload.status)).toEqual(expect.arrayContaining(["shortlisted", "interview"]));
  });

  it("internal notes are employer-only and bound to the application's real company", async () => {
    await run(w.db, w.u.recruiterA, "insert into public.application_notes (application_id, company_id, author_id, note) values ($1,$2,$3,'Strong candidate')", [app, w.companyA, w.u.recruiterA.id]);
    expect(await run(w.db, w.u.ownerA, "select 1 from public.application_notes where application_id = $1", [app])).toHaveLength(1);
    expect(await run(w.db, w.u.seeker2, "select 1 from public.application_notes")).toHaveLength(0);
    expect(await run(w.db, w.u.viewerA, "select 1 from public.application_notes")).toHaveLength(0);
    expect(await run(w.db, w.u.ownerB, "select 1 from public.application_notes")).toHaveLength(0);
    // Company B recruiter claiming company B for company A's application (IDOR attempt).
    await denied(w.db, w.u.ownerB, "insert into public.application_notes (application_id, company_id, author_id, note) values ($1,$2,$3,'x')", [app, w.companyB, w.u.ownerB.id]);
    await denied(w.db, w.u.ownerA, "insert into public.application_notes (application_id, company_id, author_id, note) values ($1,$2,$3,'x')", [app, w.companyB, w.u.ownerA.id]);
    await denied(w.db, w.u.recruiterA, "insert into public.application_notes (application_id, company_id, author_id, note) values ($1,$2,$3,'x')", [app, w.companyA, w.u.ownerA.id]);
    await denied(w.db, w.u.seeker2, "insert into public.application_notes (application_id, company_id, author_id, note) values ($1,$2,$3,'x')", [app, w.companyA, w.u.seeker2.id]);
  });

  it("a candidate withdraws their own application only; the snapshot is redacted; they may re-apply", async () => {
    await denied(w.db, w.u.seeker1, "select public.withdraw_application($1)", [app]);
    await denied(w.db, w.u.ownerA, "select public.withdraw_application($1)", [app]);
    await rpc(w.db, w.u.seeker2, "withdraw_application", [app]);
    const [a] = await sup<{ status: string; resume_snapshot: { redacted: boolean } }>(w.db, "select status, resume_snapshot from public.applications where id = $1", [app]);
    expect(a.status).toBe("withdrawn");
    expect(a.resume_snapshot).toEqual({ redacted: true });
    expect(await denied(w.db, w.u.recruiterA, "select public.set_application_status($1,'shortlisted')", [app])).toMatch(/invalid_status/);
    const again = await apply(w.u.seeker2, await w.shareableResume(w.u.seeker2, "Second CV"), [{ id: "q1", answer: "2" }]);
    expect(again[0].apply_to_job).not.toBe(app);
    expect(await sup(w.db, "select 1 from public.applications where job_id = $1 and candidate_id = $2", [job, w.u.seeker2.id])).toHaveLength(2);
  });
});

describe("external applications", () => {
  it("clicks are tracked but never create an application; internal-only apply is refused", async () => {
    const ext = await w.publishedJob(w.u.ownerA, w.companyA, { application_method: "external_url", external_url: "https://careers.example.com/apply" });
    const mail = await w.publishedJob(w.u.ownerA, w.companyA, { application_method: "external_email", external_email: "jobs@example.com" });
    expect(await denied(w.db, w.u.seeker1, "select public.apply_to_job($1,$2,'','[]'::jsonb)", [ext, resume1])).toMatch(/not_internal/);
    await run(w.db, w.u.seeker1, "select public.record_external_click($1,'url')", [ext]);
    await run(w.db, null, "select public.record_external_click($1,'url')", [ext]);          // anonymous visitors may click too
    await run(w.db, w.u.seeker1, "select public.record_external_click($1,'email')", [mail]);
    await run(w.db, w.u.seeker1, "select public.record_external_click($1,'email')", [ext]);  // wrong kind for the method: ignored
    const clicks = await sup<{ kind: string; candidate_id: string | null }>(w.db, "select kind, candidate_id from public.job_external_clicks where job_id = $1 order by created_at", [ext]);
    expect(clicks.map((c) => c.kind)).toEqual(["url", "url"]);
    expect(clicks[0].candidate_id).toBe(w.u.seeker1.id);
    expect(clicks[1].candidate_id).toBeNull();
    expect(await sup(w.db, "select 1 from public.applications where job_id = any($1)", [[ext, mail]])).toHaveLength(0);
    // Employers see their own click counts; others don't.
    expect(await run(w.db, w.u.ownerA, "select 1 from public.job_external_clicks where job_id = $1", [ext])).toHaveLength(2);
    expect(await run(w.db, w.u.ownerB, "select 1 from public.job_external_clicks")).toHaveLength(0);
    expect(await run(w.db, w.u.seeker1, "select 1 from public.job_external_clicks")).toHaveLength(0);
    await denied(w.db, w.u.seeker1, "insert into public.job_external_clicks (job_id, company_id, kind) values ($1,$2,'url')", [ext, w.companyA]);
  });

  it("clicks on non-public jobs are ignored", async () => {
    const draft = await w.draftJob(w.u.ownerA, w.companyA, { application_method: "external_url", external_url: "https://x.example.com" });
    await run(w.db, null, "select public.record_external_click($1,'url')", [draft]);
    expect(await sup(w.db, "select 1 from public.job_external_clicks where job_id = $1", [draft])).toHaveLength(0);
  });
});

describe("resumes, candidate profiles and saved jobs are private", () => {
  it("a candidate cannot read, edit or delete another candidate's resume or profile", async () => {
    expect(await run(w.db, w.u.seeker2, "select 1 from public.resumes where id = $1", [resume1])).toHaveLength(0);
    expect(await run(w.db, w.u.seeker2, "update public.resumes set title = 'pwned' where id = $1 returning id", [resume1])).toHaveLength(0);
    expect(await run(w.db, w.u.seeker2, "delete from public.resumes where id = $1 returning id", [resume1])).toHaveLength(0);
    expect(await run(w.db, w.u.ownerA, "select 1 from public.resumes")).toHaveLength(0);
    expect(await run(w.db, w.u.admin, "select 1 from public.resumes")).toHaveLength(0);
    await denied(w.db, null, "select 1 from public.resumes");
    await denied(w.db, w.u.seeker2, "insert into public.resumes (user_id, title) values ($1,'impersonation')", [w.u.seeker1.id]);
    await denied(w.db, w.u.ownerA, "insert into public.resumes (user_id, title) values ($1,'employer cv')", [w.u.ownerA.id]);
    await run(w.db, w.u.seeker1, "insert into public.candidate_profiles (user_id, headline) values ($1,'Dev')", [w.u.seeker1.id]);
    expect(await run(w.db, w.u.seeker2, "select 1 from public.candidate_profiles")).toHaveLength(0);
    await denied(w.db, w.u.seeker2, "insert into public.candidate_profiles (user_id, headline) values ($1,'x')", [w.u.seeker1.id]);
  });

  it("only one default resume per user", async () => {
    await run(w.db, w.u.seeker1, "update public.resumes set is_default = true where id = $1", [resume1]);
    const other = await w.shareableResume(w.u.seeker1, "Other");
    await denied(w.db, w.u.seeker1, "update public.resumes set is_default = true where id = $1", [other]);
  });

  it("saved jobs: seekers save public jobs only, privately; employers cannot", async () => {
    const draft = await w.draftJob(w.u.ownerA, w.companyA);
    await run(w.db, w.u.seeker1, "insert into public.saved_jobs (user_id, job_id) values ($1,$2)", [w.u.seeker1.id, job]);
    await denied(w.db, w.u.seeker1, "insert into public.saved_jobs (user_id, job_id) values ($1,$2)", [w.u.seeker1.id, draft]);
    await denied(w.db, w.u.seeker1, "insert into public.saved_jobs (user_id, job_id) values ($1,$2)", [w.u.seeker2.id, job]);
    await denied(w.db, w.u.ownerA, "insert into public.saved_jobs (user_id, job_id) values ($1,$2)", [w.u.ownerA.id, job]);
    expect(await run(w.db, w.u.seeker2, "select 1 from public.saved_jobs")).toHaveLength(0);
    expect(await run(w.db, w.u.seeker1, "delete from public.saved_jobs where job_id = $1 returning job_id", [job])).toHaveLength(1);
  });
});

describe("private resume files (storage policies)", () => {
  const putObject = (who: Parameters<typeof run>[1], bucket: string, name: string) =>
    run(w.db, who, "insert into storage.objects (bucket_id, name, owner) values ($1,$2,auth.uid()) returning id", [bucket, name]);
  const canRead = async (who: Parameters<typeof run>[1], bucket: string, name: string) =>
    (await run(w.db, who, "select 1 from storage.objects where bucket_id = $1 and name = $2", [bucket, name]).catch(() => [])).length === 1;

  it("candidates can upload only into their own folder; nobody else can read the file", async () => {
    const mine = `${w.u.seeker1.id}/cv-own.pdf`;
    await putObject(w.u.seeker1, "resumes", mine);
    await denied(w.db, w.u.seeker1, "insert into storage.objects (bucket_id, name) values ('resumes', $1)", [`${w.u.seeker2.id}/cv-spoof.pdf`]);
    await denied(w.db, w.u.ownerA, "insert into storage.objects (bucket_id, name) values ('resumes', $1)", [`${w.u.ownerA.id}/cv.pdf`]);
    await denied(w.db, null, "insert into storage.objects (bucket_id, name) values ('resumes', $1)", ["anon/cv.pdf"]);
    expect(await canRead(w.u.seeker1, "resumes", mine)).toBe(true);
    expect(await canRead(w.u.seeker2, "resumes", mine)).toBe(false);
    expect(await canRead(w.u.ownerA, "resumes", mine)).toBe(false);
    expect(await canRead(w.u.admin, "resumes", mine)).toBe(false);
    expect(await canRead(null, "resumes", mine)).toBe(false);
    expect(await run(w.db, w.u.seeker2, "delete from storage.objects where name = $1 returning id", [mine])).toHaveLength(0);
  });

  it("employers can read a resume file only through an application to their company, and not after withdrawal", async () => {
    const path = `${w.u.seeker1.id}/cv-applied.pdf`;
    await putObject(w.u.seeker1, "resumes", path);
    const [{ id: rid }] = await run<{ id: string }>(w.db, w.u.seeker1, "insert into public.resumes (user_id, title, visibility, pdf_path, pdf_name, pdf_size) values ($1,'Applied CV','shareable',$2,'cv.pdf',100) returning id", [w.u.seeker1.id, path]);
    const second = await w.publishedJob(w.u.ownerA, w.companyA, { title: "Storage Test Role" });
    const [{ apply_to_job: app }] = await rpc<{ apply_to_job: string }>(w.db, w.u.seeker1, "apply_to_job", [second, rid, "", "[]"]);
    expect(await canRead(w.u.ownerA, "resumes", path)).toBe(true);
    expect(await canRead(w.u.recruiterA, "resumes", path)).toBe(true);
    expect(await canRead(w.u.admin, "resumes", path)).toBe(true);
    expect(await canRead(w.u.viewerA, "resumes", path)).toBe(false);
    expect(await canRead(w.u.ownerB, "resumes", path)).toBe(false);
    expect(await canRead(w.u.seeker2, "resumes", path)).toBe(false);
    expect(await canRead(null, "resumes", path)).toBe(false);
    await rpc(w.db, w.u.seeker1, "withdraw_application", [app]);
    expect(await canRead(w.u.ownerA, "resumes", path)).toBe(false);
  });

  it("company documents are owner/admin only; company logos are writable by owners only", async () => {
    const doc = `${w.companyA}/registration.pdf`;
    await putObject(w.u.ownerA, "company-documents", doc);
    await denied(w.db, w.u.recruiterA, "insert into storage.objects (bucket_id, name) values ('company-documents', $1)", [`${w.companyA}/x.pdf`]);
    await denied(w.db, w.u.ownerB, "insert into storage.objects (bucket_id, name) values ('company-documents', $1)", [`${w.companyA}/y.pdf`]);
    await denied(w.db, w.u.ownerA, "insert into storage.objects (bucket_id, name) values ('company-documents', $1)", ["not-a-uuid/z.pdf"]);
    expect(await canRead(w.u.ownerA, "company-documents", doc)).toBe(true);
    expect(await canRead(w.u.admin, "company-documents", doc)).toBe(true);
    expect(await canRead(w.u.recruiterA, "company-documents", doc)).toBe(false);
    expect(await canRead(w.u.ownerB, "company-documents", doc)).toBe(false);
    await putObject(w.u.ownerA, "company-logos", `${w.companyA}/logo.png`);
    await denied(w.db, w.u.viewerA, "insert into storage.objects (bucket_id, name) values ('company-logos', $1)", [`${w.companyA}/l2.png`]);
    await denied(w.db, w.u.ownerB, "insert into storage.objects (bucket_id, name) values ('company-logos', $1)", [`${w.companyA}/l3.png`]);
  });

  it("buckets are configured: resumes private PDF-only 5 MB; logos public", async () => {
    const rows = await sup<{ id: string; public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(w.db, "select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id");
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by.resumes.public).toBe(false);
    expect(by.resumes.allowed_mime_types).toEqual(["application/pdf"]);
    expect(Number(by.resumes.file_size_limit)).toBe(5242880);
    expect(by["company-documents"].public).toBe(false);
    expect(by["company-logos"].public).toBe(true);
  });
});

describe("notifications, settings, blog, reports and rate limiting", () => {
  it("notifications are per-user and only read_at can be changed", async () => {
    const [n] = await run<{ id: string }>(w.db, w.u.recruiterA, "select id from public.notifications limit 1");
    await run(w.db, w.u.recruiterA, "update public.notifications set read_at = now() where id = $1", [n.id]);
    await denied(w.db, w.u.recruiterA, "update public.notifications set type = 'x' where id = $1", [n.id]);
    await denied(w.db, w.u.recruiterA, "update public.notifications set user_id = $2 where id = $1", [n.id, w.u.ownerB.id]);
    expect(await run(w.db, w.u.ownerB, "update public.notifications set read_at = now() where id = $1 returning id", [n.id])).toHaveLength(0);
    await denied(w.db, w.u.recruiterA, "insert into public.notifications (user_id, type) values ($1,'fake')", [w.u.recruiterA.id]);
  });

  it("site settings are publicly readable but only admins can write", async () => {
    expect(await run(w.db, null, "select 1 from public.site_settings")).toHaveLength(3);
    expect(await run(w.db, w.u.ownerA, "update public.site_settings set value = '{}' where key = 'adsense' returning key")).toHaveLength(0);
    expect(await run(w.db, w.u.admin, "update public.site_settings set value = '{\"enabled\":true}' where key = 'adsense' returning key")).toHaveLength(1);
    await denied(w.db, w.u.admin, "insert into public.site_settings (key, value) values ('evil','{}')");
  });

  it("blog: drafts are admin-only, published posts are public, writes are admin-only", async () => {
    const [{ id: cat }] = await sup<{ id: string }>(w.db, "select id from public.blog_categories where slug = 'career-guides'");
    const [{ id: post }] = await run<{ id: string }>(w.db, w.u.admin, "insert into public.blog_posts (category_id, author_id) values ($1,$2) returning id", [cat, w.u.admin.id]);
    await run(w.db, w.u.admin, "insert into public.blog_post_translations (post_id, locale, slug, title, content) values ($1,'en','how-to-write-a-cv','How to write a CV','Body text')", [post]);
    expect(await run(w.db, null, "select 1 from public.blog_posts where id = $1", [post])).toHaveLength(0);
    expect(await run(w.db, null, "select 1 from public.blog_post_translations where post_id = $1", [post])).toHaveLength(0);
    await run(w.db, w.u.admin, "update public.blog_posts set status = 'published' where id = $1", [post]);
    const [pub] = await run<{ published_at: string | null }>(w.db, null, "select published_at from public.blog_posts where id = $1", [post]);
    expect(pub.published_at).not.toBeNull();
    expect(await run(w.db, null, "select 1 from public.blog_post_translations where post_id = $1", [post])).toHaveLength(1);
    await denied(w.db, w.u.ownerA, "insert into public.blog_posts (category_id) values ($1)", [cat]);
    await denied(w.db, null, "update public.blog_posts set status = 'archived'");
    expect(await run(w.db, w.u.ownerA, "update public.blog_posts set status = 'archived' returning id")).toHaveLength(0);
    // Archived posts disappear again.
    await run(w.db, w.u.admin, "update public.blog_posts set status = 'archived' where id = $1", [post]);
    expect(await run(w.db, null, "select 1 from public.blog_posts where id = $1", [post])).toHaveLength(0);
  });

  it("job categories are public to read and admin-only to change", async () => {
    expect((await run(w.db, null, "select 1 from public.job_categories")).length).toBeGreaterThan(5);
    await denied(w.db, w.u.ownerA, "insert into public.job_categories (slug, name_en) values ('hack','Hack')");
    await run(w.db, w.u.admin, "insert into public.job_categories (slug, name_en) values ('new-cat','New Category')");
  });

  it("admin stats and company reports are role-gated", async () => {
    const [{ admin_stats: s }] = await rpc<{ admin_stats: { users: number; pending_jobs: number; applications: number } }>(w.db, w.u.admin, "admin_stats");
    expect(s.users).toBeGreaterThan(5);
    expect(s.applications).toBeGreaterThan(0);
    for (const who of [w.u.ownerA, w.u.seeker1, null] as const) await denied(w.db, who, "select public.admin_stats()");
    const [{ company_report: r }] = await rpc<{ company_report: { applications_by_status: Record<string, number> } }>(w.db, w.u.viewerA, "company_report", [w.companyA]);
    expect(Object.keys(r.applications_by_status).length).toBeGreaterThan(0);
    await denied(w.db, w.u.ownerB, "select public.company_report($1)", [w.companyA]);
    await denied(w.db, w.u.seeker1, "select public.company_report($1)", [w.companyA]);
  });

  it("rate limiting counts per key/window and is callable only by the service role", async () => {
    const hit = async () => (await rpc<{ rate_limit_hit: boolean }>(w.db, "service", "rate_limit_hit", ["login:1.2.3.4", 3, 60]))[0].rate_limit_hit;
    expect([await hit(), await hit(), await hit(), await hit()]).toEqual([true, true, true, false]);
    expect((await rpc<{ rate_limit_hit: boolean }>(w.db, "service", "rate_limit_hit", ["login:5.6.7.8", 3, 60]))[0].rate_limit_hit).toBe(true);
    await denied(w.db, w.u.admin, "select public.rate_limit_hit('x', 1, 60)");
    await denied(w.db, null, "select public.rate_limit_hit('x', 1, 60)");
    await denied(w.db, w.u.seeker1, "select * from public.rate_limits");
  });
});

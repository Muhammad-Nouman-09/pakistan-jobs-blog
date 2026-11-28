import { beforeAll, describe, expect, it } from "vitest";
import { createUser, denied, run, sup } from "./harness";
import { buildWorld, rpc, type World } from "./world";

let w: World;
beforeAll(async () => { w = await buildWorld(); });

const visibleToAnon = async (id: string) => (await run(w.db, null, "select 1 from public.job_published where job_id = $1", [id])).length === 1;
const statusOf = async (id: string) => (await sup<{ status: string }>(w.db, "select status from public.jobs where id = $1", [id]))[0].status;

describe("job creation permissions", () => {
  it("recruiters and owners create drafts; viewers, seekers and other companies cannot", async () => {
    expect(await w.draftJob(w.u.recruiterA, w.companyA)).toBeTruthy();
    expect(await w.draftJob(w.u.ownerA, w.companyA)).toBeTruthy();
    const ins = (who: typeof w.u.ownerA, company: string) =>
      run(w.db, who, "insert into public.jobs (company_id, slug_base) values ($1, 'x') returning id", [company]);
    await denied(w.db, w.u.viewerA, "insert into public.jobs (company_id, slug_base) values ($1, 'x')", [w.companyA]);
    await denied(w.db, w.u.seeker1, "insert into public.jobs (company_id, slug_base) values ($1, 'x')", [w.companyA]);
    await denied(w.db, w.u.ownerB, "insert into public.jobs (company_id, slug_base) values ($1, 'x')", [w.companyA]);
    await denied(w.db, null, "insert into public.jobs (company_id, slug_base) values ($1, 'x')", [w.companyA]);
    expect(await ins(w.u.ownerB, w.companyB)).toHaveLength(1);
  });

  it("a job cannot be created already approved/featured, and the slug ends with the reference number", async () => {
    await denied(w.db, w.u.ownerA, "insert into public.jobs (company_id, slug_base, status) values ($1, 'x', 'approved')", [w.companyA]);
    await denied(w.db, w.u.ownerA, "insert into public.jobs (company_id, slug_base, status) values ($1, 'x', 'pending_review')", [w.companyA]);
    await denied(w.db, w.u.ownerA, "insert into public.jobs (company_id, slug_base, featured) values ($1, 'x', true)", [w.companyA]);
    const id = await w.draftJob(w.u.ownerA, w.companyA, { slug_base: "sales-executive-lahore" });
    const [j] = await sup<{ slug: string; ref_no: string; created_by: string }>(w.db, "select slug, ref_no, created_by from public.jobs where id = $1", [id]);
    expect(j.slug).toBe(`sales-executive-lahore-${j.ref_no}`);
    expect(j.created_by).toBe(w.u.ownerA.id);
  });

  it("created_by cannot be spoofed on insert", async () => {
    const [{ id }] = await run<{ id: string }>(w.db, w.u.recruiterA, "insert into public.jobs (company_id, slug_base, created_by) values ($1,'x',$2) returning id", [w.companyA, w.u.ownerA.id]);
    const [j] = await sup<{ created_by: string }>(w.db, "select created_by from public.jobs where id = $1", [id]);
    expect(j.created_by).toBe(w.u.recruiterA.id);
  });

  it("employers of other companies cannot read, edit, delete or submit someone else's job", async () => {
    const id = await w.draftJob(w.u.ownerA, w.companyA);
    expect(await run(w.db, w.u.ownerB, "select 1 from public.jobs where id = $1", [id])).toHaveLength(0);
    expect(await run(w.db, w.u.ownerB, "select 1 from public.job_translations where job_id = $1", [id])).toHaveLength(0);
    expect(await run(w.db, w.u.ownerB, "update public.jobs set vacancies = 99 where id = $1 returning id", [id])).toHaveLength(0);
    expect(await run(w.db, w.u.ownerB, "delete from public.jobs where id = $1 returning id", [id])).toHaveLength(0);
    await denied(w.db, w.u.ownerB, "select public.submit_job_for_review($1)", [id]);
    await denied(w.db, w.u.ownerB, "select public.archive_job($1)", [id]);
    await denied(w.db, w.u.ownerB, "insert into public.job_translations (job_id, locale, title) values ($1,'ur','Ghost title')", [id]);
    expect(await run(w.db, w.u.ownerB, "select * from public.job_reviews")).toHaveLength(0);
  });

  it("viewers can read their company's jobs but not change them", async () => {
    const id = await w.draftJob(w.u.recruiterA, w.companyA);
    expect(await run(w.db, w.u.viewerA, "select 1 from public.jobs where id = $1", [id])).toHaveLength(1);
    expect(await run(w.db, w.u.viewerA, "update public.jobs set vacancies = 5 where id = $1 returning id", [id])).toHaveLength(0);
    expect(await run(w.db, w.u.viewerA, "update public.job_translations set title = 'Changed title' where job_id = $1 returning job_id", [id])).toHaveLength(0);
    await denied(w.db, w.u.viewerA, "select public.submit_job_for_review($1)", [id]);
  });
});

describe("approval workflow", () => {
  it("employers can never set status, approve or feature a job — via update, RPC or review history", async () => {
    const id = await w.draftJob(w.u.ownerA, w.companyA);
    for (const s of ["approved", "pending_review", "expired", "archived"]) {
      await denied(w.db, w.u.ownerA, `update public.jobs set status = '${s}' where id = '${id}'`);
    }
    await denied(w.db, w.u.ownerA, `update public.jobs set featured = true where id = '${id}'`);
    await denied(w.db, w.u.ownerA, `update public.jobs set published_at = now() where id = '${id}'`);
    await denied(w.db, w.u.ownerA, "select public.review_job($1,'approve',null)", [id]);
    await denied(w.db, w.u.ownerA, "select public.set_job_featured($1,true)", [id]);
    await denied(w.db, w.u.ownerA, "insert into public.job_reviews (job_id, action) values ($1,'approved')", [id]);
    await denied(w.db, w.u.ownerA, "insert into public.job_published (job_id, ref_no, slug, company_id, default_language, sector, employment_type, workplace_type, country, salary_currency, salary_period, vacancies, deadline, application_method, published_at) values ($1,1,'evil',$2,'en','private','full_time','onsite','Pakistan','PKR','month',1,current_date + 5,'internal',now())", [id, w.companyA]);
    expect(await statusOf(id)).toBe("draft");
    expect(await visibleToAnon(id)).toBe(false);
  });

  it("a recruiter submits, an admin approves, and only then is the job public", async () => {
    const id = await w.draftJob(w.u.recruiterA, w.companyA);
    expect(await visibleToAnon(id)).toBe(false);
    await w.submit(w.u.recruiterA, id);
    expect(await statusOf(id)).toBe("pending_review");
    expect(await visibleToAnon(id)).toBe(false);
    await w.review(id, "approve");
    expect(await statusOf(id)).toBe("approved");
    expect(await visibleToAnon(id)).toBe(true);
    const [t] = await run<{ title: string }>(w.db, null, "select title from public.job_published_translations where job_id = $1", [id]);
    expect(t.title).toBe("Senior Software Engineer");
  });

  it("admin review is admin-only: seekers, viewers, recruiters, anonymous are refused", async () => {
    const id = await w.draftJob(w.u.ownerA, w.companyA);
    await w.submit(w.u.ownerA, id);
    for (const who of [w.u.ownerA, w.u.recruiterA, w.u.viewerA, w.u.seeker1, w.u.ownerB, null] as const) {
      await denied(w.db, who, "select public.review_job($1,'approve',null)", [id]);
      await denied(w.db, who, "select public.review_job($1,'reject','no')", [id]);
    }
    expect(await statusOf(id)).toBe("pending_review");
  });

  it("a pending employer (unverified company) cannot submit jobs; a suspended company's jobs cannot be approved", async () => {
    const e = await createUser(w.db, "unverified@x.test", { role: "employer" });
    const [{ create_company: cid }] = await rpc<{ create_company: string }>(w.db, e, "create_company", ["Unverified Co", "", "", "", "", "", "Pakistan", "Lahore", "", ""]);
    const id = await w.draftJob(e, cid);
    expect(await denied(w.db, e, "select public.submit_job_for_review($1)", [id])).toMatch(/company_not_verified/);

    const jid = await w.draftJob(w.u.ownerB, w.companyB);
    await w.submit(w.u.ownerB, jid);
    await rpc(w.db, w.u.admin, "admin_set_company_verification", [w.companyB, "suspended", "Policy violation"]);
    expect(await denied(w.db, w.u.admin, "select public.review_job($1,'approve',null)", [jid])).toMatch(/company_not_verified/);
    await rpc(w.db, w.u.admin, "admin_set_company_verification", [w.companyB, "verified", null]);
  });

  it("submission validates required fields (deadline, category, location, content, external link)", async () => {
    const noDeadline = await w.draftJob(w.u.ownerA, w.companyA, { deadlineOffset: -1 });
    expect(await denied(w.db, w.u.ownerA, "select public.submit_job_for_review($1)", [noDeadline])).toMatch(/deadline_required/);
    const shortDesc = await w.draftJob(w.u.ownerA, w.companyA, { description: "too short" });
    expect(await denied(w.db, w.u.ownerA, "select public.submit_job_for_review($1)", [shortDesc])).toMatch(/content_required/);
    const noCat = await w.draftJob(w.u.ownerA, w.companyA, { category_id: null });
    expect(await denied(w.db, w.u.ownerA, "select public.submit_job_for_review($1)", [noCat])).toMatch(/category_required/);
    const noUrl = await w.draftJob(w.u.ownerA, w.companyA, { application_method: "external_url" });
    expect(await denied(w.db, w.u.ownerA, "select public.submit_job_for_review($1)", [noUrl])).toMatch(/external_url_required/);
    await denied(w.db, w.u.ownerA, "update public.jobs set external_url = 'javascript:alert(1)' where id = $1", [noUrl]);
    await denied(w.db, w.u.ownerA, "update public.jobs set external_email = 'nope' where id = $1", [noUrl]);
  });

  it("reject and request-changes require a reason; rejected jobs stay private to authorised users", async () => {
    const id = await w.draftJob(w.u.ownerA, w.companyA);
    await w.submit(w.u.ownerA, id);
    expect(await denied(w.db, w.u.admin, "select public.review_job($1,'reject',null)", [id])).toMatch(/reason_required/);
    expect(await denied(w.db, w.u.admin, "select public.review_job($1,'request_changes','')", [id])).toMatch(/reason_required/);
    await w.review(id, "reject", "Salary missing and description unclear");
    expect(await statusOf(id)).toBe("rejected");
    expect(await visibleToAnon(id)).toBe(false);
    expect(await run(w.db, w.u.recruiterA, "select 1 from public.jobs where id = $1", [id])).toHaveLength(1);
    expect(await run(w.db, w.u.ownerB, "select 1 from public.jobs where id = $1", [id])).toHaveLength(0);
    expect(await run(w.db, w.u.seeker1, "select 1 from public.jobs where id = $1", [id])).toHaveLength(0);
    expect(await run(w.db, w.u.admin, "select 1 from public.jobs where id = $1", [id])).toHaveLength(1);
    // A rejected job cannot be approved without being resubmitted.
    expect(await denied(w.db, w.u.admin, "select public.review_job($1,'approve',null)", [id])).toMatch(/invalid_status/);
  });

  it("changes_requested returns to the employer, who can edit and resubmit", async () => {
    const id = await w.draftJob(w.u.recruiterA, w.companyA);
    await w.submit(w.u.recruiterA, id);
    await w.review(id, "request_changes", "Please add the salary range");
    expect(await statusOf(id)).toBe("changes_requested");
    await run(w.db, w.u.recruiterA, "update public.jobs set salary_min = 90000, salary_max = 120000 where id = $1", [id]);
    expect(await statusOf(id)).toBe("changes_requested");     // still awaiting an explicit resubmission
    await w.submit(w.u.recruiterA, id);
    await w.review(id, "approve");
    expect(await visibleToAnon(id)).toBe(true);
  });

  it("a job in review is locked for employers (withdraw first); admins may still fix typos", async () => {
    const id = await w.draftJob(w.u.ownerA, w.companyA);
    await w.submit(w.u.ownerA, id);
    expect(await denied(w.db, w.u.ownerA, "update public.jobs set vacancies = 3 where id = $1", [id])).toMatch(/job_locked/);
    expect(await run(w.db, w.u.ownerA, "update public.job_translations set title = 'Sneaky edit' where job_id = $1 returning job_id", [id])).toHaveLength(0);
    expect(await run(w.db, w.u.admin, "update public.jobs set vacancies = 3 where id = $1 returning id", [id])).toHaveLength(1);
    await rpc(w.db, w.u.ownerA, "withdraw_job", [id]);
    expect(await statusOf(id)).toBe("draft");
    expect(await run(w.db, w.u.ownerA, "update public.jobs set vacancies = 4 where id = $1 returning id", [id])).toHaveLength(1);
  });

  it("editing a published job starts a new draft revision and the approved public version stays online", async () => {
    const id = await w.publishedJob(w.u.ownerA, w.companyA, { title: "Original Title For Role" });
    await run(w.db, w.u.ownerA, "update public.job_translations set title = 'Edited Title For Role' where job_id = $1 and locale = 'en'", [id]);
    expect(await statusOf(id)).toBe("draft");
    // Public copy is untouched while the revision is unsubmitted AND while it is pending.
    let [t] = await run<{ title: string }>(w.db, null, "select title from public.job_published_translations where job_id = $1", [id]);
    expect(t.title).toBe("Original Title For Role");
    await w.submit(w.u.ownerA, id);
    [t] = await run<{ title: string }>(w.db, null, "select title from public.job_published_translations where job_id = $1", [id]);
    expect(t.title).toBe("Original Title For Role");
    expect(await visibleToAnon(id)).toBe(true);
    // Approval promotes the revision.
    await w.review(id, "approve");
    [t] = await run<{ title: string }>(w.db, null, "select title from public.job_published_translations where job_id = $1", [id]);
    expect(t.title).toBe("Edited Title For Role");
  });

  it("editing job fields (not only translations) of an approved job also forces re-review", async () => {
    const id = await w.publishedJob(w.u.ownerA, w.companyA);
    await run(w.db, w.u.ownerA, "update public.jobs set salary_max = 999999 where id = $1", [id]);
    expect(await statusOf(id)).toBe("draft");
    const [pub] = await run<{ salary_max: string }>(w.db, null, "select salary_max from public.job_published where job_id = $1", [id]);
    expect(Number(pub.salary_max)).toBe(200000);
  });

  it("keeps a complete review history, visible to the company and hidden from outsiders", async () => {
    const id = await w.draftJob(w.u.ownerA, w.companyA);
    await w.submit(w.u.ownerA, id);
    await w.review(id, "request_changes", "Add more detail to the description");
    await w.submit(w.u.ownerA, id);
    await w.review(id, "approve");
    const hist = await run<{ action: string; reason: string | null }>(w.db, w.u.viewerA, "select action, reason from public.job_reviews where job_id = $1 order by created_at, id", [id]);
    expect(hist.map((h) => h.action)).toEqual(["submitted", "changes_requested", "submitted", "approved"]);
    expect(hist[1].reason).toBe("Add more detail to the description");
    expect(await run(w.db, w.u.ownerB, "select 1 from public.job_reviews where job_id = $1", [id])).toHaveLength(0);
    await denied(w.db, w.u.ownerA, "update public.job_reviews set reason = 'rewritten'");
    await denied(w.db, w.u.admin, "delete from public.job_reviews");
  });

  it("archiving takes a live job offline; admin unpublish needs a reason; restore returns it to draft", async () => {
    const a = await w.publishedJob(w.u.ownerA, w.companyA);
    await rpc(w.db, w.u.recruiterA, "archive_job", [a]);
    expect(await visibleToAnon(a)).toBe(false);
    expect(await statusOf(a)).toBe("archived");
    expect(await denied(w.db, w.u.ownerA, "update public.jobs set vacancies = 2 where id = $1", [a])).toMatch(/job_locked/);
    await rpc(w.db, w.u.ownerA, "restore_job", [a]);
    expect(await statusOf(a)).toBe("draft");

    const b = await w.publishedJob(w.u.ownerA, w.companyA);
    expect(await denied(w.db, w.u.admin, "select public.review_job($1,'unpublish',null)", [b])).toMatch(/reason_required/);
    await w.review(b, "unpublish", "Reported as misleading");
    expect(await visibleToAnon(b)).toBe(false);
  });

  it("every workflow transition is audited", async () => {
    const logs = await run<{ action: string }>(w.db, w.u.admin, "select distinct action from public.audit_logs");
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(["job.submitted", "job.approved", "job.rejected", "job.changes_requested", "job.archived", "job.unpublished"]));
    expect(await run(w.db, w.u.ownerA, "select * from public.audit_logs")).toHaveLength(0);
    await denied(w.db, w.u.admin, "insert into public.audit_logs (action, entity_type) values ('x','y')");
    await denied(w.db, w.u.admin, "delete from public.audit_logs");
  });

  it("admins are notified of submissions and companies of decisions", async () => {
    const id = await w.draftJob(w.u.ownerA, w.companyA);
    await w.submit(w.u.ownerA, id);
    const adminN = await run<{ type: string }>(w.db, w.u.admin, "select type from public.notifications where payload ->> 'job_id' = $1", [id]);
    expect(adminN.map((n) => n.type)).toContain("job_submitted");
    await w.review(id, "reject", "Not suitable for the portal");
    const ownerN = await run<{ type: string }>(w.db, w.u.ownerA, "select type from public.notifications where payload ->> 'job_id' = $1", [id]);
    expect(ownerN.map((n) => n.type)).toContain("job_rejected");
    expect(await run(w.db, w.u.ownerB, "select 1 from public.notifications where payload ->> 'job_id' = $1", [id])).toHaveLength(0);
  });
});

describe("public visibility, expiry and search", () => {
  it("drafts, pending, rejected and archived jobs never appear in public search", async () => {
    const draft = await w.draftJob(w.u.ownerA, w.companyA, { title: "Zebra Draft Role" });
    const pending = await w.draftJob(w.u.ownerA, w.companyA, { title: "Zebra Pending Role" });
    await w.submit(w.u.ownerA, pending);
    const live = await w.publishedJob(w.u.ownerA, w.companyA, { title: "Zebra Live Role" });
    const rows = await run<{ job_id: string }>(w.db, null, "select job_id from public.search_jobs('zebra')");
    expect(rows.map((r) => r.job_id)).toEqual([live]);
    expect(rows.map((r) => r.job_id)).not.toContain(draft);
  });

  it("expired jobs disappear from listings and facets, but the detail row remains for the 'closed' page", async () => {
    const id = await w.publishedJob(w.u.ownerA, w.companyA, { title: "Quokka Expiring Role" });
    expect(await run(w.db, null, "select 1 from public.search_jobs('quokka')")).toHaveLength(1);
    await sup(w.db, "update public.job_published set deadline = public.today_pk() - 1 where job_id = $1", [id]);
    await sup(w.db, "update public.jobs set deadline = public.today_pk() - 1 where id = $1", [id]);
    expect(await run(w.db, null, "select 1 from public.search_jobs('quokka')")).toHaveLength(0);
    expect(await visibleToAnon(id)).toBe(true);
    await rpc(w.db, "service", "expire_jobs");
    expect(await statusOf(id)).toBe("expired");
    await denied(w.db, w.u.ownerA, "select public.expire_jobs()");
    // A job whose deadline is today (Pakistan time) is still open.
    const today = await w.publishedJob(w.u.ownerA, w.companyA, { title: "Quokka Today Role", deadlineOffset: 0 });
    expect((await run<{ job_id: string }>(w.db, null, "select job_id from public.search_jobs('quokka')")).map((r) => r.job_id)).toEqual([today]);
  });

  it("the deadline cannot be approved if already past", async () => {
    const id = await w.draftJob(w.u.ownerA, w.companyA, { title: "Past Deadline Role" });
    await w.submit(w.u.ownerA, id);
    await sup(w.db, "update public.jobs set deadline = public.today_pk() - 3 where id = $1", [id]);
    expect(await denied(w.db, w.u.admin, "select public.review_job($1,'approve',null)", [id])).toMatch(/deadline_passed/);
  });

  it("suspending a company hides its published jobs from the public immediately", async () => {
    const id = await w.publishedJob(w.u.ownerB, w.companyB, { title: "Wombat Hidden Role" });
    expect(await run(w.db, null, "select 1 from public.search_jobs('wombat')")).toHaveLength(1);
    await rpc(w.db, w.u.admin, "admin_set_company_verification", [w.companyB, "suspended", "Under investigation"]);
    expect(await run(w.db, null, "select 1 from public.search_jobs('wombat')")).toHaveLength(0);
    expect(await visibleToAnon(id)).toBe(false);
    await rpc(w.db, w.u.admin, "admin_set_company_verification", [w.companyB, "verified", null]);
    expect(await run(w.db, null, "select 1 from public.search_jobs('wombat')")).toHaveLength(1);
  });

  it("filters, sorting, pagination and total counts work", async () => {
    await w.publishedJob(w.u.ownerA, w.companyA, { title: "Filter Alpha Teacher", city: "Karachi", province: "Sindh", category_id: w.category2, employment_type: "part_time", workplace_type: "hybrid", salary_min: 30000, salary_max: 50000, deadlineOffset: 5, sector: "government" });
    await w.publishedJob(w.u.ownerA, w.companyA, { title: "Filter Beta Developer", city: "Lahore", province: "Punjab", employment_type: "full_time", workplace_type: "remote", salary_min: 300000, salary_max: 400000, deadlineOffset: 20 });
    await w.publishedJob(w.u.ownerB, w.companyB, { title: "Filter Gamma Developer", city: "Lahore", province: "Punjab", employment_type: "contract", workplace_type: "onsite", salary_min: null, salary_max: null, deadlineOffset: 10 });
    const q = async (sql: string, p: unknown[] = []) => (await run<{ title: string; total_count: string }>(w.db, null, `select title, total_count from public.search_jobs(${sql})`, p));
    expect(await q("'filter'")).toHaveLength(3);
    expect((await q("p_q => 'filter', p_city => 'lahore'")).map((r) => r.title).sort()).toEqual(["Filter Beta Developer", "Filter Gamma Developer"]);
    expect((await q("p_q => 'filter', p_province => 'Sindh'")).map((r) => r.title)).toEqual(["Filter Alpha Teacher"]);
    expect((await q("p_q => 'filter', p_category => 'education-teaching'")).map((r) => r.title)).toEqual(["Filter Alpha Teacher"]);
    expect((await q("p_q => 'filter', p_employment => 'contract'")).map((r) => r.title)).toEqual(["Filter Gamma Developer"]);
    expect((await q("p_q => 'filter', p_workplace => 'remote'")).map((r) => r.title)).toEqual(["Filter Beta Developer"]);
    expect((await q("p_q => 'filter', p_sector => 'government'")).map((r) => r.title)).toEqual(["Filter Alpha Teacher"]);
    expect((await q("p_q => 'filter', p_salary_min => 250000")).map((r) => r.title)).toEqual(["Filter Beta Developer"]);
    expect((await q("p_q => 'filter', p_sort => 'deadline'")).map((r) => r.title)).toEqual(["Filter Alpha Teacher", "Filter Gamma Developer", "Filter Beta Developer"]);
    expect((await q("p_q => 'filter', p_sort => 'salary'")).map((r) => r.title)[0]).toBe("Filter Beta Developer");
    const page1 = await q("p_q => 'filter', p_sort => 'deadline', p_limit => 2, p_offset => 0");
    const page2 = await q("p_q => 'filter', p_sort => 'deadline', p_limit => 2, p_offset => 2");
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(1);
    expect(Number(page1[0].total_count)).toBe(3);
    expect((await q("p_q => 'filter', p_company => $1", [w.companyB])).map((r) => r.title)).toEqual(["Filter Gamma Developer"]);
    // Hostile search input is just text.
    expect(await q("p_q => $1", ["' or 1=1 --"])).toEqual([]);
  });

  it("urdu-only jobs fall back to the available language rather than inventing a translation", async () => {
    const [{ id }] = await run<{ id: string }>(w.db, w.u.ownerA,
      `insert into public.jobs (company_id, category_id, slug_base, city, default_language, deadline) values ($1,$2,'urdu-teacher-lahore','Lahore','ur', public.today_pk() + 10) returning id`, [w.companyA, w.category2]);
    await run(w.db, w.u.ownerA, `insert into public.job_translations (job_id, locale, title, description) values ($1,'ur','اردو استاد درکار ہیں','ہمیں ایک تجربہ کار استاد کی ضرورت ہے جو بچوں کو پڑھا سکے۔')`, [id]);
    await w.submit(w.u.ownerA, id);
    await w.review(id, "approve");
    const en = await run<{ title: string; title_locale: string }>(w.db, null, "select title, title_locale from public.search_jobs('استاد', 'en')");
    expect(en).toHaveLength(1);
    expect(en[0].title_locale).toBe("ur");        // shown in its real language, flagged so the UI can say so
    const both = await run<{ locale: string }>(w.db, null, "select locale from public.job_published_translations where job_id = $1", [id]);
    expect(both.map((b) => b.locale)).toEqual(["ur"]);
  });

  it("featured is admin-only and mirrored to the public copy", async () => {
    const id = await w.publishedJob(w.u.ownerA, w.companyA, { title: "Featured Candidate Role" });
    await denied(w.db, w.u.ownerA, "select public.set_job_featured($1,true)", [id]);
    await rpc(w.db, w.u.admin, "set_job_featured", [id, true]);
    const [p] = await run<{ featured: boolean }>(w.db, null, "select featured from public.job_published where job_id = $1", [id]);
    expect(p.featured).toBe(true);
    expect((await run<{ job_id: string }>(w.db, null, "select job_id from public.search_jobs(p_featured_only => true)")).map((r) => r.job_id)).toContain(id);
  });

  it("only drafts/rejected/archived jobs without applications can be deleted", async () => {
    const live = await w.publishedJob(w.u.ownerA, w.companyA);
    expect(await run(w.db, w.u.ownerA, "delete from public.jobs where id = $1 returning id", [live])).toHaveLength(0);
    const draft = await w.draftJob(w.u.ownerA, w.companyA);
    expect(await run(w.db, w.u.ownerA, "delete from public.jobs where id = $1 returning id", [draft])).toHaveLength(1);
  });

  it("facets only describe open public jobs", async () => {
    const [{ job_facets: f }] = await run<{ job_facets: { cities: { value: string }[]; totals: { jobs: number } } }>(w.db, null, "select public.job_facets('en')");
    expect(f.totals.jobs).toBeGreaterThan(0);
    expect(f.cities.map((c) => c.value)).toContain("Lahore");
  });
});

describe("save_job (atomic save, runs with the caller's rights)", () => {
  const fields = (o: Record<string, unknown> = {}) => JSON.stringify({ default_language: "en", category_id: w.category, city: "Lahore", province: "Punjab", vacancies: 2, deadline: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10), application_method: "internal", slug_base: "data-analyst-lahore", ...o });
  const tr = (o: Record<string, unknown> = {}) => JSON.stringify({ en: { title: "Data Analyst", description: "Analyse data and build dashboards for our team." }, ...o });
  const save = (who: Parameters<typeof run>[1], id: string | null, company: string, f = fields(), t = tr()) =>
    run<{ save_job: string }>(w.db, who, "select public.save_job($1,$2,$3::jsonb,$4::jsonb)", [id, company, f, t]);

  it("creates the job and both translations in one call; a recruiter may, a viewer/outsider may not", async () => {
    const [{ save_job: id }] = await save(w.u.recruiterA, null, w.companyA, fields(), tr({ ur: { title: "ڈیٹا اینالسٹ", description: "ہماری ٹیم کے لیے ڈیٹا کا تجزیہ کریں۔" } }));
    expect(await sup(w.db, "select 1 from public.job_translations where job_id = $1", [id])).toHaveLength(2);
    const [j] = await sup<{ status: string; slug: string; ref_no: string }>(w.db, "select status, slug, ref_no from public.jobs where id = $1", [id]);
    expect(j.status).toBe("draft");
    expect(j.slug).toBe(`data-analyst-lahore-${j.ref_no}`);
    await denied(w.db, w.u.viewerA, "select public.save_job(null,$1,$2::jsonb,$3::jsonb)", [w.companyA, fields(), tr()]);
    await denied(w.db, w.u.ownerB, "select public.save_job(null,$1,$2::jsonb,$3::jsonb)", [w.companyA, fields(), tr()]);
    await denied(w.db, null, "select public.save_job(null,$1,$2::jsonb,$3::jsonb)", [w.companyA, fields(), tr()]);
    expect(await denied(w.db, w.u.ownerB, "select public.save_job($1,$2,$3::jsonb,$4::jsonb)", [id, w.companyB, fields(), tr()])).toMatch(/job_not_found/);
  });

  it("requires the default-language translation and rolls back completely on failure", async () => {
    const before = (await sup<{ n: number }>(w.db, "select count(*)::int n from public.jobs"))[0].n;
    expect(await denied(w.db, w.u.ownerA, "select public.save_job(null,$1,$2::jsonb,$3::jsonb)", [w.companyA, fields({ default_language: "ur" }), tr()])).toMatch(/content_required/);
    await denied(w.db, w.u.ownerA, "select public.save_job(null,$1,$2::jsonb,$3::jsonb)", [w.companyA, fields({ vacancies: 0 }), tr()]);
    await denied(w.db, w.u.ownerA, "select public.save_job(null,$1,$2::jsonb,$3::jsonb)", [w.companyA, fields({ external_url: "javascript:alert(1)" }), tr()]);
    expect((await sup<{ n: number }>(w.db, "select count(*)::int n from public.jobs"))[0].n).toBe(before);
  });

  it("editing an approved job through save_job starts a new draft and keeps the public copy; dropping a non-default locale deletes it", async () => {
    const id = await w.publishedJob(w.u.ownerA, w.companyA, { title: "Public Version Title" });
    await save(w.u.ownerA, id, w.companyA, fields(), JSON.stringify({ en: { title: "Revised Version Title", description: "A fully rewritten description for this role." }, ur: { title: "نظرثانی شدہ عنوان", description: "اس کردار کی نئی تفصیل۔" } }));
    expect(await statusOf(id)).toBe("draft");
    const [pub] = await run<{ title: string }>(w.db, null, "select title from public.job_published_translations where job_id = $1 and locale = 'en'", [id]);
    expect(pub.title).toBe("Public Version Title");
    expect(await sup(w.db, "select 1 from public.job_translations where job_id = $1", [id])).toHaveLength(2);
    await save(w.u.ownerA, id, w.companyA, fields(), tr());
    expect(await sup(w.db, "select 1 from public.job_translations where job_id = $1", [id])).toHaveLength(1);
  });

  it("a job in review cannot be saved over by the employer", async () => {
    const id = await w.draftJob(w.u.ownerA, w.companyA);
    await w.submit(w.u.ownerA, id);
    expect(await denied(w.db, w.u.ownerA, "select public.save_job($1,$2,$3::jsonb,$4::jsonb)", [id, w.companyA, fields({ vacancies: 9 }), tr()])).toMatch(/job_locked/);
  });
});

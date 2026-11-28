import { createDb, createUser, makeAdmin, run, sup, type Actor, type Db } from "./harness";

export type World = Awaited<ReturnType<typeof buildWorld>>;

export const rpc = <T = Record<string, unknown>>(db: Db, who: Actor | null | "service", fn: string, args: unknown[] = []) =>
  run<T>(db, who, `select * from public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")})`, args);

const COMPANY_ARGS = (name: string) => [name, "A tech company", "Software", "https://example.com", "hr@example.com", "0300000000", "Pakistan", "Lahore", "Main road", "11-50"];

/** Builds a realistic multi-tenant world once; tests then probe it from different identities. */
export async function buildWorld() {
  const db = await createDb();
  const admin = await createUser(db, "admin@portal.test");
  await makeAdmin(db, admin.email);
  const u = {
    admin,
    ownerA: await createUser(db, "owner-a@x.test", { role: "employer" }),
    recruiterA: await createUser(db, "recruiter-a@x.test", { role: "employer" }),
    viewerA: await createUser(db, "viewer-a@x.test", { role: "employer" }),
    ownerB: await createUser(db, "owner-b@y.test", { role: "employer" }),
    seeker1: await createUser(db, "seeker1@z.test"),
    seeker2: await createUser(db, "seeker2@z.test", { role: "job_seeker" }),
    unconfirmed: await createUser(db, "nope@z.test", { role: "employer", confirmed: false })
  };

  const [{ create_company: companyA }] = await rpc<{ create_company: string }>(db, u.ownerA, "create_company", COMPANY_ARGS("Alpha Tech"));
  const [{ create_company: companyB }] = await rpc<{ create_company: string }>(db, u.ownerB, "create_company", COMPANY_ARGS("Beta Works"));
  await rpc(db, u.admin, "admin_set_company_verification", [companyA, "verified", null]);
  await rpc(db, u.admin, "admin_set_company_verification", [companyB, "verified", null]);
  await rpc(db, u.admin, "admin_add_member", [companyA, u.recruiterA.id, "recruiter"]);
  await rpc(db, u.admin, "admin_add_member", [companyA, u.viewerA.id, "viewer"]);

  const [{ id: category }] = await sup<{ id: string }>(db, "select id from public.job_categories where slug = 'information-technology'");
  const [{ id: category2 }] = await sup<{ id: string }>(db, "select id from public.job_categories where slug = 'education-teaching'");

  /** Create a draft job + English translation as `who` (a recruiter/owner). */
  async function draftJob(who: Actor, company: string, o: Record<string, unknown> = {}) {
    const f = {
      title: "Senior Software Engineer", slug_base: "senior-software-engineer-lahore", city: "Lahore", province: "Punjab",
      category_id: category, employment_type: "full_time", workplace_type: "onsite", application_method: "internal",
      external_url: null as string | null, external_email: null as string | null, screening: "[]", salary_min: 100000, salary_max: 200000,
      sector: "private", deadlineOffset: 30, description: "We are hiring a senior engineer to build our platform.", ...o
    };
    const [{ id }] = await run<{ id: string }>(
      db, who,
      `insert into public.jobs (company_id, category_id, slug_base, city, province, employment_type, workplace_type, application_method,
         external_url, external_email, screening_questions, salary_min, salary_max, sector, deadline)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14, public.today_pk() + $15::int) returning id`,
      [company, f.category_id, f.slug_base, f.city, f.province, f.employment_type, f.workplace_type, f.application_method,
        f.external_url, f.external_email, f.screening, f.salary_min, f.salary_max, f.sector, f.deadlineOffset]
    );
    await run(db, who, `insert into public.job_translations (job_id, locale, title, description, requirements) values ($1,'en',$2,$3,'3 years experience')`,
      [id, f.title, f.description]);
    return id;
  }
  const submit = (who: Actor, job: string) => rpc(db, who, "submit_job_for_review", [job]);
  const review = (job: string, action: string, reason: string | null = null) => rpc(db, u.admin, "review_job", [job, action, reason]);
  async function publishedJob(who: Actor, company: string, o: Record<string, unknown> = {}) {
    const id = await draftJob(who, company, o);
    await submit(who, id);
    await review(id, "approve");
    return id;
  }
  async function shareableResume(who: Actor, title = "My CV") {
    const [{ id }] = await run<{ id: string }>(db, who,
      `insert into public.resumes (user_id, title, visibility, content, pdf_path, pdf_name, pdf_size)
       values ($1,$2,'shareable','{"summary":"Experienced developer"}'::jsonb,$3,'cv.pdf',1000) returning id`,
      [who.id, title, `${who.id}/${crypto.randomUUID()}.pdf`]);
    return id;
  }

  return { db, u, companyA, companyB, category, category2, draftJob, submit, review, publishedJob, shareableResume };
}

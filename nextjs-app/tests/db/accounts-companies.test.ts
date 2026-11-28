import { beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { createUser, denied, run, sup } from "./harness";
import { buildWorld, rpc, type World } from "./world";

let w: World;
beforeAll(async () => { w = await buildWorld(); });

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

describe("account roles and privilege escalation", () => {
  it("sign-up metadata can never produce an admin; employer and job_seeker are honoured", async () => {
    const evil = await createUser(w.db, "evil@x.test", { role: "admin" });
    const nonsense = await createUser(w.db, "nonsense@x.test", { role: "superuser" });
    const rows = await sup<{ id: string; role: string }>(w.db, "select id, role from public.profiles where id = any($1)", [[evil.id, nonsense.id, w.u.ownerA.id, w.u.seeker1.id]]);
    const role = (id: string) => rows.find((r) => r.id === id)!.role;
    expect(role(evil.id)).toBe("job_seeker");
    expect(role(nonsense.id)).toBe("job_seeker");
    expect(role(w.u.ownerA.id)).toBe("employer");
    expect(role(w.u.seeker1.id)).toBe("job_seeker");
  });

  it("a signed-in user cannot change their own role, status, email or id", async () => {
    for (const set of ["role = 'admin'", "status = 'active'", "email = 'x@y.z'", "id = gen_random_uuid()"]) {
      await denied(w.db, w.u.seeker1, `update public.profiles set ${set} where id = '${w.u.seeker1.id}'`);
    }
    const [p] = await sup<{ role: string }>(w.db, "select role from public.profiles where id = $1", [w.u.seeker1.id]);
    expect(p.role).toBe("job_seeker");
  });

  it("even an admin cannot change roles through the client API; provision_admin is service-role only", async () => {
    await denied(w.db, w.u.admin, `update public.profiles set role = 'admin' where id = '${w.u.seeker1.id}'`);
    await denied(w.db, w.u.seeker1, "select public.provision_admin('seeker1@z.test')");
    await denied(w.db, w.u.admin, "select public.provision_admin('seeker1@z.test')");
    await denied(w.db, null, "select public.provision_admin('seeker1@z.test')");
  });

  it("users may edit their harmless profile fields only", async () => {
    await run(w.db, w.u.seeker1, "update public.profiles set full_name = 'Ali Khan', city = 'Quetta' where id = $1", [w.u.seeker1.id]);
    const [p] = await sup<{ full_name: string }>(w.db, "select full_name from public.profiles where id = $1", [w.u.seeker1.id]);
    expect(p.full_name).toBe("Ali Khan");
    // Another user's row is invisible to update (0 rows), not editable.
    const r = await run(w.db, w.u.seeker1, "update public.profiles set full_name = 'Hacked' where id = $1 returning id", [w.u.seeker2.id]);
    expect(r).toHaveLength(0);
  });

  it("profiles are private: a user sees only themselves; admin sees everyone; teammates see each other", async () => {
    expect(await run(w.db, w.u.seeker1, "select id from public.profiles")).toHaveLength(1);
    expect((await run(w.db, w.u.admin, "select id from public.profiles")).length).toBeGreaterThan(5);
    const team = await run<{ id: string }>(w.db, w.u.recruiterA, "select id from public.profiles");
    expect(team.map((r) => r.id).sort()).toEqual([w.u.ownerA.id, w.u.recruiterA.id, w.u.viewerA.id].sort());
    expect(await run(w.db, null, "select id from public.profiles").catch(() => "denied")).toBe("denied");
  });

  it("unconfirmed e-mail accounts cannot act (create companies)", async () => {
    const msg = await denied(w.db, w.u.unconfirmed, "select public.create_company('Ghost Co','','','','','','Pakistan','Lahore','','')");
    expect(msg).toMatch(/forbidden/);
  });

  it("job seekers cannot create companies; suspended employers cannot either", async () => {
    await denied(w.db, w.u.seeker1, "select public.create_company('Seeker Co','','','','','','Pakistan','Lahore','','')");
    const victim = await createUser(w.db, "suspendme@x.test", { role: "employer" });
    await rpc(w.db, w.u.admin, "set_user_status", [victim.id, "suspended"]);
    await denied(w.db, victim, "select public.create_company('Suspended Co','','','','','','Pakistan','Lahore','','')");
  });

  it("suspension is admin-only, cannot target admins or self, and is audited", async () => {
    await denied(w.db, w.u.ownerA, "select public.set_user_status($1, 'suspended')", [w.u.seeker2.id]);
    await denied(w.db, w.u.admin, "select public.set_user_status($1, 'suspended')", [w.u.admin.id]);
    const log = await run<{ action: string }>(w.db, w.u.admin, "select action from public.audit_logs where action = 'user.suspended'");
    expect(log.length).toBeGreaterThan(0);
  });
});

describe("company creation, verification and visibility", () => {
  it("self-managed company starts pending with the creator as owner", async () => {
    const e = await createUser(w.db, "newbie@x.test", { role: "employer" });
    const [{ create_company: id }] = await rpc<{ create_company: string }>(w.db, e, "create_company", ["Newbie Ltd", "", "", "", "", "", "Pakistan", "Karachi", "", ""]);
    const [c] = await sup<{ verification_status: string; managed_by: string }>(w.db, "select verification_status, managed_by from public.companies where id = $1", [id]);
    expect(c).toEqual({ verification_status: "pending", managed_by: "self" });
    const [m] = await sup<{ role: string }>(w.db, "select role from public.company_members where company_id = $1 and user_id = $2", [id, e.id]);
    expect(m.role).toBe("owner");
  });

  it("employers cannot insert companies directly or modify verification fields", async () => {
    await denied(w.db, w.u.ownerA, "insert into public.companies (name, slug, verification_status) values ('Direct','direct','verified')");
    await denied(w.db, w.u.ownerA, `update public.companies set verification_status = 'suspended' where id = '${w.companyA}'`);
    await denied(w.db, w.u.ownerA, `update public.companies set managed_by = 'platform' where id = '${w.companyA}'`);
    await denied(w.db, w.u.ownerA, "select public.admin_set_company_verification($1, 'verified', null)", [w.companyA]);
  });

  it("owners edit company info; recruiters and viewers cannot", async () => {
    const upd = (who: typeof w.u.ownerA) => run(w.db, who, "update public.companies set description = 'Updated' where id = $1 returning id", [w.companyA]);
    expect(await upd(w.u.ownerA)).toHaveLength(1);
    expect(await upd(w.u.recruiterA)).toHaveLength(0);
    expect(await upd(w.u.viewerA)).toHaveLength(0);
    expect(await upd(w.u.ownerB)).toHaveLength(0);
    expect(await upd(w.u.seeker1)).toHaveLength(0);
  });

  it("an unrelated employer cannot see another company's private data, members or invitations", async () => {
    expect(await run(w.db, w.u.ownerB, "select * from public.company_private where company_id = $1", [w.companyA])).toHaveLength(0);
    expect(await run(w.db, w.u.ownerB, "select * from public.company_members where company_id = $1", [w.companyA])).toHaveLength(0);
    expect(await run(w.db, w.u.ownerB, "select * from public.company_invitations where company_id = $1", [w.companyA])).toHaveLength(0);
    // Own company is visible, viewers can read company info but not invitations.
    expect(await run(w.db, w.u.viewerA, "select * from public.company_private where company_id = $1", [w.companyA])).toHaveLength(1);
    expect(await run(w.db, w.u.viewerA, "select * from public.company_invitations where company_id = $1", [w.companyA])).toHaveLength(0);
  });

  it("anonymous visitors see only verified companies and never private columns", async () => {
    const pending = await createUser(w.db, "pendingco@x.test", { role: "employer" });
    const [{ create_company: pid }] = await rpc<{ create_company: string }>(w.db, pending, "create_company", ["Pending Co", "", "", "", "pc@x.test", "", "Pakistan", "Lahore", "", ""]);
    const rows = await run<{ id: string }>(w.db, null, "select id from public.companies");
    expect(rows.map((r) => r.id)).toContain(w.companyA);
    expect(rows.map((r) => r.id)).not.toContain(pid);
    await denied(w.db, null, "select * from public.company_private");
    await denied(w.db, null, "select created_by from public.companies");
    const list = await run<{ name: string }>(w.db, null, "select name from public.list_companies()");
    expect(list.map((r) => r.name)).toEqual(expect.arrayContaining(["Alpha Tech", "Beta Works"]));
    expect(list.map((r) => r.name)).not.toContain("Pending Co");
  });

  it("verification statuses: reject/suspend need a reason; owner can resubmit only when rejected", async () => {
    const e = await createUser(w.db, "verif@x.test", { role: "employer" });
    const [{ create_company: id }] = await rpc<{ create_company: string }>(w.db, e, "create_company", ["Verif Co", "", "", "", "", "", "Pakistan", "Lahore", "", ""]);
    await denied(w.db, w.u.admin, "select public.admin_set_company_verification($1,'rejected',null)", [id]);
    await rpc(w.db, w.u.admin, "admin_set_company_verification", [id, "rejected", "Documents unreadable"]);
    const notes = await run<{ verification_note: string }>(w.db, e, "select verification_note from public.company_private where company_id = $1", [id]);
    expect(notes[0].verification_note).toBe("Documents unreadable");
    await denied(w.db, w.u.ownerB, "select public.resubmit_company_verification($1)", [id]);
    await rpc(w.db, e, "resubmit_company_verification", [id]);
    const [c] = await sup<{ verification_status: string }>(w.db, "select verification_status from public.companies where id = $1", [id]);
    expect(c.verification_status).toBe("pending");
    await denied(w.db, e, "select public.resubmit_company_verification($1)", [id]);
  });

  it("platform-managed companies: admin creates, assigns owner, recruiter and viewer", async () => {
    const owner = await createUser(w.db, "client-owner@x.test", { role: "employer" });
    const rec = await createUser(w.db, "client-rec@x.test", { role: "employer" });
    const [{ admin_create_company: id }] = await rpc<{ admin_create_company: string }>(w.db, w.u.admin, "admin_create_company",
      ["Managed Client", "d", "Retail", "https://client.test", "c@client.test", "", "Pakistan", "Islamabad", "", "51-200", true]);
    const [c] = await sup<{ managed_by: string; verification_status: string }>(w.db, "select managed_by, verification_status from public.companies where id = $1", [id]);
    expect(c).toEqual({ managed_by: "platform", verification_status: "verified" });
    await rpc(w.db, w.u.admin, "admin_add_member", [id, owner.id, "owner"]);
    await rpc(w.db, w.u.admin, "admin_add_member", [id, rec.id, "recruiter"]);
    expect(await run(w.db, owner, "select 1 from public.companies where id = $1 and public.can_manage_company(id)", [id])).toHaveLength(1);
    await denied(w.db, w.u.ownerA, "select public.admin_create_company('X','','','','','','','','','',true)");
    await denied(w.db, w.u.ownerA, "select public.admin_add_member($1,$2,'owner')", [id, w.u.ownerA.id]);
    // Job seekers cannot be made company members.
    await denied(w.db, w.u.admin, "select public.admin_add_member($1,$2,'viewer')", [id, w.u.seeker1.id]);
  });
});

describe("invitations and membership roles", () => {
  const invite = async (who: typeof w.u.ownerA, email: string, role: string, ttl = 168) => {
    const token = randomBytes(32).toString("hex");
    const [{ create_company_invitation: id }] = await rpc<{ create_company_invitation: string }>(w.db, who, "create_company_invitation", [w.companyA, email, role, hash(token), ttl]);
    return { token, id };
  };

  it("only owners (and admins) can invite; recruiters and viewers cannot; owner role needs an admin", async () => {
    await denied(w.db, w.u.recruiterA, "select public.create_company_invitation($1,'a@b.co','viewer',$2,24)", [w.companyA, hash("x1")]);
    await denied(w.db, w.u.viewerA, "select public.create_company_invitation($1,'a@b.co','viewer',$2,24)", [w.companyA, hash("x2")]);
    await denied(w.db, w.u.ownerB, "select public.create_company_invitation($1,'a@b.co','viewer',$2,24)", [w.companyA, hash("x3")]);
    await denied(w.db, w.u.ownerA, "select public.create_company_invitation($1,'a@b.co','owner',$2,24)", [w.companyA, hash("x4")]);
    await denied(w.db, w.u.ownerA, "select public.create_company_invitation($1,'not-an-email','viewer',$2,24)", [w.companyA, hash("x5")]);
  });

  it("the raw token is never stored, and acceptance requires the invited, verified e-mail", async () => {
    const invited = await createUser(w.db, "new-recruiter@q.test", { role: "employer" });
    const { token } = await invite(w.u.ownerA, "new-recruiter@q.test", "recruiter");
    const stored = await sup<{ token_hash: string }>(w.db, "select token_hash from public.company_invitations where email = 'new-recruiter@q.test'");
    expect(stored[0].token_hash).toBe(hash(token));
    expect(stored[0].token_hash).not.toBe(token);

    // Wrong person with the right token, wrong token, and a stranger are all refused identically.
    expect(await denied(w.db, w.u.ownerB, "select public.accept_company_invitation($1)", [hash(token)])).toMatch(/invalid_invitation/);
    expect(await denied(w.db, invited, "select public.accept_company_invitation($1)", [hash("wrong")])).toMatch(/invalid_invitation/);
    await rpc(w.db, invited, "accept_company_invitation", [hash(token)]);
    const [m] = await sup<{ role: string }>(w.db, "select role from public.company_members where company_id = $1 and user_id = $2", [w.companyA, invited.id]);
    expect(m.role).toBe("recruiter");
    // Single use.
    expect(await denied(w.db, invited, "select public.accept_company_invitation($1)", [hash(token)])).toMatch(/invalid_invitation/);
  });

  it("expired and revoked invitations cannot be accepted", async () => {
    const a = await createUser(w.db, "late@q.test", { role: "employer" });
    const { token: t1 } = await invite(w.u.ownerA, "late@q.test", "viewer", 1);
    await sup(w.db, "update public.company_invitations set expires_at = now() - interval '1 minute' where email = 'late@q.test'");
    expect(await denied(w.db, a, "select public.accept_company_invitation($1)", [hash(t1)])).toMatch(/invalid_invitation/);

    const b = await createUser(w.db, "revoked@q.test", { role: "employer" });
    const { token: t2, id } = await invite(w.u.ownerA, "revoked@q.test", "viewer");
    await denied(w.db, w.u.recruiterA, "select public.revoke_company_invitation($1)", [id]);
    await rpc(w.db, w.u.ownerA, "revoke_company_invitation", [id]);
    expect(await denied(w.db, b, "select public.accept_company_invitation($1)", [hash(t2)])).toMatch(/invalid_invitation/);
  });

  it("an invitation is refused for job seeker accounts (account type is fixed at sign-up)", async () => {
    const seeker = await createUser(w.db, "seeker-invited@q.test");
    const { token } = await invite(w.u.ownerA, "seeker-invited@q.test", "viewer");
    expect(await denied(w.db, seeker, "select public.accept_company_invitation($1)", [hash(token)])).toMatch(/wrong_account_type/);
  });

  it("a recruiter cannot change roles, remove others, or transfer ownership", async () => {
    await denied(w.db, w.u.recruiterA, "select public.set_member_role($1,$2,'viewer')", [w.companyA, w.u.viewerA.id]);
    await denied(w.db, w.u.recruiterA, "select public.set_member_role($1,$2,'recruiter')", [w.companyA, w.u.recruiterA.id]);
    await denied(w.db, w.u.recruiterA, "select public.remove_member($1,$2)", [w.companyA, w.u.viewerA.id]);
    await denied(w.db, w.u.recruiterA, "select public.remove_member($1,$2)", [w.companyA, w.u.ownerA.id]);
    await denied(w.db, w.u.recruiterA, "select public.transfer_company_ownership($1,$2)", [w.companyA, w.u.recruiterA.id]);
    await denied(w.db, w.u.viewerA, "select public.transfer_company_ownership($1,$2)", [w.companyA, w.u.viewerA.id]);
    await denied(w.db, w.u.ownerB, "select public.transfer_company_ownership($1,$2)", [w.companyA, w.u.ownerB.id]);
    // Direct writes to the membership table are impossible for any client.
    await denied(w.db, w.u.recruiterA, `update public.company_members set role = 'owner' where user_id = '${w.u.recruiterA.id}'`);
    await denied(w.db, w.u.ownerA, `insert into public.company_members values ('${w.companyA}', '${w.u.ownerB.id}', 'owner')`);
  });

  it("owners manage roles but cannot make a second owner except by transfer; last owner is protected", async () => {
    await rpc(w.db, w.u.ownerA, "set_member_role", [w.companyA, w.u.viewerA.id, "recruiter"]);
    await rpc(w.db, w.u.ownerA, "set_member_role", [w.companyA, w.u.viewerA.id, "viewer"]);
    expect(await denied(w.db, w.u.ownerA, "select public.set_member_role($1,$2,'owner')", [w.companyA, w.u.viewerA.id])).toMatch(/use_transfer/);
    expect(await denied(w.db, w.u.ownerA, "select public.remove_member($1,$2)", [w.companyA, w.u.ownerA.id])).toMatch(/last_owner/);
    // Non-members can't be promoted via transfer.
    expect(await denied(w.db, w.u.ownerA, "select public.transfer_company_ownership($1,$2)", [w.companyA, w.u.seeker1.id])).toMatch(/member_not_found/);
  });

  it("ownership transfer promotes the new owner and demotes the previous one; members may leave", async () => {
    const e = await createUser(w.db, "xfer-owner@x.test", { role: "employer" });
    const r = await createUser(w.db, "xfer-rec@x.test", { role: "employer" });
    const [{ create_company: id }] = await rpc<{ create_company: string }>(w.db, e, "create_company", ["Xfer Co", "", "", "", "", "", "Pakistan", "Lahore", "", ""]);
    await rpc(w.db, w.u.admin, "admin_add_member", [id, r.id, "recruiter"]);
    await rpc(w.db, e, "transfer_company_ownership", [id, r.id]);
    const roles = await sup<{ user_id: string; role: string }>(w.db, "select user_id, role from public.company_members where company_id = $1", [id]);
    expect(roles.find((x) => x.user_id === r.id)!.role).toBe("owner");
    expect(roles.find((x) => x.user_id === e.id)!.role).toBe("recruiter");
    await rpc(w.db, e, "remove_member", [id, e.id]);   // former owner leaves
    expect(await sup(w.db, "select 1 from public.company_members where company_id = $1", [id])).toHaveLength(1);
  });
});

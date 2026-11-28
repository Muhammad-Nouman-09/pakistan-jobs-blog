import { beforeAll, describe, expect, it } from "vitest";
import { denied, run } from "./harness";
import { buildWorld, type World } from "./world";

let w: World;
beforeAll(async () => { w = await buildWorld(); });

const insert = "insert into public.contact_messages (name,email,subject,message) values ('A','a@b.co','Hi','A wrong deadline on a job') returning id";

describe("contact inbox", () => {
  it("only the server (service role) can create messages; browsers, users and even admins cannot", async () => {
    for (const who of [null, w.u.seeker1, w.u.ownerA, w.u.admin] as const) await denied(w.db, who, insert);
    expect(await run(w.db, "service", insert)).toHaveLength(1);
  });

  it("only admins can read, mark read, or delete; read_at is the only editable column", async () => {
    expect(await run(w.db, w.u.seeker1, "select 1 from public.contact_messages")).toHaveLength(0);
    await denied(w.db, null, "select 1 from public.contact_messages");
    expect(await run(w.db, w.u.admin, "select 1 from public.contact_messages")).toHaveLength(1);
    expect(await run(w.db, w.u.ownerA, "update public.contact_messages set read_at = now() returning id")).toHaveLength(0);
    expect(await run(w.db, w.u.admin, "update public.contact_messages set read_at = now() returning id")).toHaveLength(1);
    await denied(w.db, w.u.admin, "update public.contact_messages set message = 'tampered'");
    expect(await run(w.db, w.u.ownerA, "delete from public.contact_messages returning id")).toHaveLength(0);
    expect(await run(w.db, w.u.admin, "delete from public.contact_messages returning id")).toHaveLength(1);
  });

  it("validates input at the database level", async () => {
    await denied(w.db, "service", "insert into public.contact_messages (name,email,subject,message) values ('A','not-an-email','S','M')");
    await denied(w.db, "service", "insert into public.contact_messages (name,email,subject,message) values ('A','a@b.co','S','')");
  });
});

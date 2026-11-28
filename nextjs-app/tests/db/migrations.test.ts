import { describe, expect, it } from "vitest";
import { createDb, sup } from "./harness";

describe("migrations", () => {
  it("apply cleanly in order on an empty database and seed reference data", async () => {
    const db = await createDb();
    const cats = await sup(db, "select count(*)::int n from public.job_categories");
    expect(cats[0].n).toBeGreaterThan(5);
    const settings = await sup(db, "select key from public.site_settings order by key");
    expect(settings.map((r) => r.key)).toEqual(["adsense", "general", "seo"]);
  });

  it("enable RLS on every public table", async () => {
    const db = await createDb();
    const rows = await sup(
      db,
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`
    );
    expect(rows).toEqual([]);
  });
});

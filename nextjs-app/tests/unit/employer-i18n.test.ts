import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { getMessages } from "@/lib/i18n";
import { employer } from "@/lib/i18n/messages/employer";

const root = path.resolve(import.meta.dirname, "../..");
const DIRS = ["app/[locale]/employer", "app/[locale]/invitations", "components/employer", "lib/services/employer.ts"];

function files(p: string): string[] {
  const abs = path.join(root, p);
  if (statSync(abs).isFile()) return [abs];
  return readdirSync(abs).flatMap((f) => files(path.join(p, f)));
}

describe("employer i18n", () => {
  it("has every employer key in both languages", () => {
    const missingUr = Object.keys(employer.en).filter((k) => !(k in employer.ur));
    const extraUr = Object.keys(employer.ur).filter((k) => !(k in employer.en));
    expect(missingUr).toEqual([]);
    expect(extraUr).toEqual([]);
  });

  it("every literal key used in the employer area exists (English) and is translated (Urdu)", () => {
    const en = getMessages("en");
    const ur = getMessages("ur");
    const used = new Set<string>();
    for (const d of DIRS) {
      for (const f of files(d)) {
        if (!/\.(ts|tsx)$/.test(f)) continue;
        const src = readFileSync(f, "utf8");
        for (const m of src.matchAll(/[("'`](employer\.[A-Za-z0-9_.]*[A-Za-z0-9_])[)"'`,]/g)) used.add(m[1]);
        for (const m of src.matchAll(/\bt\(\s*"([A-Za-z0-9_.]+)"/g)) used.add(m[1]);
      }
    }
    expect(used.size).toBeGreaterThan(150);   // sanity: the scan really found the keys
    const missingEn = [...used].filter((k) => !(k in en));
    const missingUr = [...used].filter((k) => k in en && !(k in ur));
    expect(missingEn).toEqual([]);
    expect(missingUr).toEqual([]);
  });

  it("covers every dynamic key family", () => {
    const en = getMessages("en");
    const families: Record<string, string[]> = {
      "employer.notice.": ["pending", "verified", "rejected", "suspended"],
      "employer.docs.type.": ["registration", "tax", "authorization", "other"],
      "employer.invite.state.": ["pending", "accepted", "revoked", "expired"],
      "employer.job.statusHelp.": ["draft", "pending_review", "approved", "rejected", "changes_requested", "expired", "archived"],
      "employer.jobs.locked.": ["pending_review", "archived"],
      "employer.resume.level.": ["basic", "conversational", "fluent", "native"],
      "employer.review.action.": ["submitted", "approved", "rejected", "changes_requested", "withdrawn", "unpublished", "archived"],
      "employer.notif.type.": ["job_approved", "job_rejected", "job_changes_requested", "job_unpublished", "company_verified", "company_rejected",
        "company_suspended", "company_pending", "application_received", "member_joined", "ownership_transferred", "added_to_company", "generic"]
    };
    for (const [prefix, names] of Object.entries(families)) for (const n of names) expect(en[prefix + n], prefix + n).toBeTruthy();
  });
});

import { describe, expect, it } from "vitest";
import { createT } from "@/lib/i18n";
import { daysLeft, todayPK } from "@/lib/utils";

// Pakistan Standard Time is UTC+5 with no daylight saving, so 19:00Z is already the next calendar day in Karachi.
const pkt = (iso: string) => new Date(iso);

describe("job deadlines (Asia/Karachi calendar dates, inclusive)", () => {
  const now = pkt("2026-11-28T05:00:00Z"); // 10:00 on 28 Nov in Pakistan

  it("a job closing today has 0 days left and is still active", () => {
    expect(todayPK(now)).toBe("2026-11-28");
    expect(daysLeft("2026-11-28", now)).toBe(0);
  });

  it("tomorrow is 1 day left, two days ahead is 2, five days ahead is 5", () => {
    expect(daysLeft("2026-11-29", now)).toBe(1);
    expect(daysLeft("2026-11-30", now)).toBe(2);
    expect(daysLeft("2026-12-03", now)).toBe(5);
  });

  it("yesterday is closed (negative)", () => {
    expect(daysLeft("2026-11-27", now)).toBe(-1);
  });

  it("uses the Pakistan date, not UTC: 19:00Z on 28 Nov is already 29 Nov in Karachi", () => {
    const late = pkt("2026-11-28T19:00:00Z");
    expect(todayPK(late)).toBe("2026-11-29");
    expect(daysLeft("2026-11-28", late)).toBe(-1); // closed the moment Pakistan's 28 Nov ends
    expect(daysLeft("2026-11-29", late)).toBe(0);  // still open all of 29 Nov
  });

  it("23:59 on the deadline day in Pakistan is still today", () => {
    const lastMinute = pkt("2026-11-28T18:59:00Z"); // 23:59 PKT on 28 Nov
    expect(daysLeft("2026-11-28", lastMinute)).toBe(0);
  });

  it("month boundary: 30 Nov closing date becomes 1 December correctly", () => {
    const nov30 = pkt("2026-11-30T06:00:00Z");
    expect(daysLeft("2026-11-30", nov30)).toBe(0);
    expect(daysLeft("2026-12-01", nov30)).toBe(1);
  });

  it("year boundary: 31 Dec closing date gives 1 day left on 31 Dec and 1 January is 1 day ahead", () => {
    const dec31 = pkt("2026-12-31T06:00:00Z");
    expect(daysLeft("2026-12-31", dec31)).toBe(0);
    expect(daysLeft("2027-01-01", dec31)).toBe(1);
  });

  it("no deadline gives null, not a number", () => {
    expect(daysLeft(null, now)).toBeNull();
    expect(daysLeft(undefined, now)).toBeNull();
  });

  it("never uses rounded millisecond differences (a deadline 23 hours away can still be today)", () => {
    const morning = pkt("2026-11-28T00:30:00Z"); // 05:30 PKT
    expect(daysLeft("2026-11-28", morning)).toBe(0);
  });

  it("uses correct singular and plural wording", () => {
    const en = createT("en");
    expect(en("job.dayLeft", { n: 1 })).toBe("1 day left");
    expect(en("job.daysLeft", { n: 2 })).toBe("2 days left");
    expect(en("job.closesToday")).toBe("closes today");
  });
});

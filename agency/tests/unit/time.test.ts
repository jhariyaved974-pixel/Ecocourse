import { describe, expect, it } from "vitest";
import { canRunScheduledAutomation, dayKey, inQuietHours, isWorkingDay, nextAllowedTime, serviceWindowOpen } from "@/server/time";

const rules = { workingDays: [1, 2, 3, 4, 5, 6], quietHours: { start: 21, end: 9 } };
const tz = "Asia/Kolkata";
// 2026-10-18 is a Sunday. 05:30 UTC = 11:00 IST.
const sundayIst11 = new Date("2026-10-18T05:30:00Z");
const mondayIst11 = new Date("2026-10-19T05:30:00Z");

describe("business calendar", () => {
  it("treats Sunday (IST) as a day off", () => {
    expect(isWorkingDay(sundayIst11, tz, rules)).toBe(false);
    expect(isWorkingDay(mondayIst11, tz, rules)).toBe(true);
  });
  it("uses the business timezone, not UTC, for the day boundary", () => {
    // Saturday 20:00 UTC = Sunday 01:30 IST
    expect(isWorkingDay(new Date("2026-10-17T20:00:00Z"), tz, rules)).toBe(false);
    expect(dayKey(new Date("2026-10-17T20:00:00Z"), tz)).toBe("2026-10-18");
  });
  it("respects overnight quiet hours", () => {
    expect(inQuietHours(new Date("2026-10-19T16:30:00Z"), tz, rules)).toBe(true); // 22:00 IST
    expect(inQuietHours(new Date("2026-10-19T02:30:00Z"), tz, rules)).toBe(true); // 08:00 IST
    expect(inQuietHours(mondayIst11, tz, rules)).toBe(false);
  });
  it("defers Sunday work to Monday 09:00 IST", () => {
    expect(canRunScheduledAutomation(sundayIst11, tz, rules)).toBe(false);
    expect(nextAllowedTime(sundayIst11, tz, rules).toISOString()).toBe("2026-10-19T03:30:00.000Z");
  });
  it("computes the 24-hour customer service window", () => {
    const now = new Date("2026-10-19T10:00:00Z");
    expect(serviceWindowOpen(new Date("2026-10-18T10:30:00Z"), now)).toBe(true);
    expect(serviceWindowOpen(new Date("2026-10-18T09:59:00Z"), now)).toBe(false);
    expect(serviceWindowOpen(null, now)).toBe(false);
  });
});

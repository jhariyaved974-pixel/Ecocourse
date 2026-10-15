/**
 * Business-calendar helpers. All scheduling decisions are made in the business timezone
 * (default Asia/Kolkata) so "Sunday" and "quiet hours" mean the owner's local time.
 */
export type CalendarRules = { workingDays: number[]; quietHours: { start: number; end: number } };

export function localParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const isoWeekday = ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[parts.weekday!]!;
  return { year: parts.year!, month: parts.month!, day: parts.day!, hour: Number(parts.hour), minute: Number(parts.minute), isoWeekday };
}

/** YYYY-MM-DD in the business timezone (used for daily counters). */
export function dayKey(date: Date, timeZone: string) {
  const p = localParts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

export function isWorkingDay(date: Date, timeZone: string, rules: CalendarRules) {
  return rules.workingDays.includes(localParts(date, timeZone).isoWeekday);
}

export function inQuietHours(date: Date, timeZone: string, rules: CalendarRules) {
  const { start, end } = rules.quietHours;
  if (start === end) return false;
  const h = localParts(date, timeZone).hour;
  return start > end ? h >= start || h < end : h >= start && h < end;
}

export function canRunScheduledAutomation(date: Date, timeZone: string, rules: CalendarRules) {
  return isWorkingDay(date, timeZone, rules) && !inQuietHours(date, timeZone, rules);
}

/** Next instant (stepping in 15-minute increments, at most 8 days) at which scheduled automation may run. */
export function nextAllowedTime(from: Date, timeZone: string, rules: CalendarRules): Date {
  let t = new Date(from.getTime());
  for (let i = 0; i < 8 * 24 * 4; i++) {
    if (canRunScheduledAutomation(t, timeZone, rules)) return t;
    t = new Date(t.getTime() + 15 * 60 * 1000);
  }
  return t;
}

export const HOUR = 60 * 60 * 1000;
export const SERVICE_WINDOW_MS = 24 * HOUR;

/** WhatsApp customer-service window: free-form messages are allowed for 24h after the customer's last message. */
export function serviceWindowOpen(lastInboundAt: Date | null | undefined, now = new Date()) {
  return Boolean(lastInboundAt && now.getTime() - lastInboundAt.getTime() < SERVICE_WINDOW_MS);
}

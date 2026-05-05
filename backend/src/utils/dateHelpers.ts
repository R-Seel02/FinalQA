/**
 * Date utility functions. All rental dates are normalized to UTC midnight
 * to avoid timezone drift between the cellar's local clock and the database.
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function startOfDayUtc(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function nightsBetween(start: Date, end: Date): number {
  const startUtc = startOfDayUtc(start).getTime();
  const endUtc = startOfDayUtc(end).getTime();
  return Math.round((endUtc - startUtc) / MS_PER_DAY);
}

export function dateRangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  // Inclusive boundary: a range ending on day N conflicts with one starting on day N
  // (same physical day). This matches AC-004.3 in the Phase 1 backlog.
  return aStart <= bEnd && bStart <= aEnd;
}

export function daysSince(date: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - date.getTime()) / MS_PER_DAY);
}

export function isPastDate(date: Date, now: Date = new Date()): boolean {
  return startOfDayUtc(date) < startOfDayUtc(now);
}

export function isTodayOrPast(date: Date, now: Date = new Date()): boolean {
  return startOfDayUtc(date) <= startOfDayUtc(now);
}

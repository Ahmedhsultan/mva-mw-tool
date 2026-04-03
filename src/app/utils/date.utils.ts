/**
 * Shared date utility functions used across components.
 * Centralizes date formatting and calendar logic to avoid duplication.
 */

/** Convert a Date to 'YYYY-MM-DD' string (locale-safe, no timezone shift) */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Check if a date is today */
export function isToday(date: Date): boolean {
  return toDateString(date) === toDateString(new Date());
}

/** Check if a date falls on a weekend (Saturday=6, Sunday=0) */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** Format a date as short day name (e.g. 'Mon') */
export function formatDay(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

/** Format a date as 'MMM D' (e.g. 'Jan 5') */
export function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Format a date as 'MMM D, YYYY' (e.g. 'Jan 5, 2026') */
export function formatFullDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Format an ISO string as a locale date-time string */
export function formatIsoDateTime(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Get the Monday of the week containing the given date.
 * Returns a new Date set to 00:00:00.000.
 */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const weekStart = new Date(d.setDate(diff));
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

/**
 * Build an array of consecutive dates starting from `start` for `count` days.
 */
export function buildDateRange(start: Date, count: number): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }
  return dates;
}

/**
 * Shift a date by a number of days (positive = forward, negative = backward).
 * Returns a new Date instance.
 */
export function shiftDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Check if two date ranges overlap: [startA, endA] and [startB, endB] (YYYY-MM-DD strings) */
export function dateRangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA <= endB && endA >= startB;
}

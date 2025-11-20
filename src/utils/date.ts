import { format, subDays, parseISO } from 'date-fns';

/**
 * Format a date to ISO 8601 string (YYYY-MM-DDTHH:mm:ss.sssZ)
 */
export function toISOString(date: Date): string {
  return date.toISOString();
}

/**
 * Format a date for Marketo API (YYYY-MM-DDTHH:mm:ssZ)
 */
export function toMarketoFormat(date: Date): string {
  // Use toISOString and remove milliseconds
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Format a date for file system paths (YYYY/MM)
 */
export function toPathFormat(date: Date): { year: string; month: string } {
  return {
    year: format(date, 'yyyy'),
    month: format(date, 'MM')
  };
}

/**
 * Format a date for human-readable display
 */
export function toDisplayFormat(date: Date): string {
  return format(date, 'yyyy-MM-dd HH:mm:ss');
}

/**
 * Get date N days ago from now
 */
export function getDaysAgo(days: number): Date {
  return subDays(new Date(), days);
}

/**
 * Parse an ISO date string to Date object
 */
export function parseDate(dateStr: string): Date {
  return parseISO(dateStr);
}

/**
 * Get current date/time
 */
export function now(): Date {
  return new Date();
}

/**
 * Check if a date string is valid
 */
export function isValidDate(dateStr: string): boolean {
  try {
    const date = parseISO(dateStr);
    return !isNaN(date.getTime());
  } catch {
    return false;
  }
}

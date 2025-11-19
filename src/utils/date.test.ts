import {
  toISOString,
  toMarketoFormat,
  toPathFormat,
  toDisplayFormat,
  getDaysAgo,
  parseDate,
  now,
  isValidDate
} from './date';

describe('Date Utilities', () => {
  describe('toISOString', () => {
    it('should convert date to ISO 8601 string', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      const result = toISOString(date);
      expect(result).toBe('2024-01-15T10:30:00.000Z');
    });
  });

  describe('toMarketoFormat', () => {
    it('should format date for Marketo API', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      const result = toMarketoFormat(date);
      expect(result).toBe('2024-01-15T10:30:00Z');
    });
  });

  describe('toPathFormat', () => {
    it('should format date for file paths', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      const result = toPathFormat(date);
      expect(result).toEqual({
        year: '2024',
        month: '01'
      });
    });

    it('should pad single digit months', () => {
      const date = new Date('2024-03-05T10:30:00.000Z');
      const result = toPathFormat(date);
      expect(result.month).toBe('03');
    });

    it('should handle December correctly', () => {
      const date = new Date('2024-12-31T10:30:00.000Z');
      const result = toPathFormat(date);
      expect(result).toEqual({
        year: '2024',
        month: '12'
      });
    });
  });

  describe('toDisplayFormat', () => {
    it('should format date for human-readable display', () => {
      const date = new Date('2024-01-15T10:30:45.000Z');
      const result = toDisplayFormat(date);
      expect(result).toMatch(/2024-01-15/);
    });
  });

  describe('getDaysAgo', () => {
    it('should return date N days ago', () => {
      const result = getDaysAgo(7);
      const expected = new Date();
      expected.setDate(expected.getDate() - 7);

      // Check that dates are close (within 1 second to account for execution time)
      expect(Math.abs(result.getTime() - expected.getTime())).toBeLessThan(1000);
    });

    it('should handle 0 days', () => {
      const result = getDaysAgo(0);
      const now = new Date();

      expect(Math.abs(result.getTime() - now.getTime())).toBeLessThan(1000);
    });

    it('should handle 90 days', () => {
      const result = getDaysAgo(90);
      const expected = new Date();
      expected.setDate(expected.getDate() - 90);

      expect(Math.abs(result.getTime() - expected.getTime())).toBeLessThan(1000);
    });
  });

  describe('parseDate', () => {
    it('should parse ISO date string', () => {
      const result = parseDate('2024-01-15T10:30:00.000Z');
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe('2024-01-15T10:30:00.000Z');
    });

    it('should parse date-only string', () => {
      const result = parseDate('2024-01-15');
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0); // January is 0
      expect(result.getDate()).toBe(15);
    });
  });

  describe('now', () => {
    it('should return current date', () => {
      const result = now();
      const expected = new Date();

      expect(Math.abs(result.getTime() - expected.getTime())).toBeLessThan(100);
    });
  });

  describe('isValidDate', () => {
    it('should return true for valid ISO date string', () => {
      expect(isValidDate('2024-01-15T10:30:00.000Z')).toBe(true);
    });

    it('should return true for valid date-only string', () => {
      expect(isValidDate('2024-01-15')).toBe(true);
    });

    it('should return false for invalid date string', () => {
      expect(isValidDate('invalid-date')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidDate('')).toBe(false);
    });

    it('should return false for malformed date', () => {
      expect(isValidDate('2024-13-01')).toBe(false); // Invalid month
    });
  });
});

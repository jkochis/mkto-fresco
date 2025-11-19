import { retry, isRetryableError } from './retry';

describe('Retry Utilities', () => {
  describe('retry', () => {
    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await retry(fn, { maxRetries: 3 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const result = await retry(fn, { maxRetries: 3, initialDelayMs: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Persistent failure'));

      await expect(
        retry(fn, { maxRetries: 3, initialDelayMs: 10 })
      ).rejects.toThrow('Persistent failure');

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      await retry(fn, {
        maxRetries: 3,
        initialDelayMs: 100,
        backoffMultiplier: 2
      });
      const duration = Date.now() - startTime;

      // Should have delays of 100ms + 200ms = 300ms minimum
      expect(duration).toBeGreaterThanOrEqual(250);
    });

    it('should respect max delay', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      await retry(fn, {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 50,
        backoffMultiplier: 2
      });
      const duration = Date.now() - startTime;

      // Max delay is 50ms, so total should be around 100ms (50ms * 2 retries)
      expect(duration).toBeLessThan(200);
    });

    it('should work with default options', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await retry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('isRetryableError', () => {
    it('should identify network errors as retryable', () => {
      const error = new Error('Network error occurred');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should identify timeout errors as retryable', () => {
      const error = new Error('Request timeout');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should identify ECONNREFUSED errors as retryable', () => {
      const error = new Error('connect ECONNREFUSED');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should identify ECONNRESET errors as retryable', () => {
      const error = new Error('socket hang up ECONNRESET');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should identify 5xx status codes as retryable', () => {
      const error = { status: 500 };
      expect(isRetryableError(error)).toBe(true);

      const error503 = { status: 503 };
      expect(isRetryableError(error503)).toBe(true);
    });

    it('should identify 429 (rate limit) as retryable', () => {
      const error = { status: 429 };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should not identify 4xx errors as retryable', () => {
      const error = { status: 400 };
      expect(isRetryableError(error)).toBe(false);

      const error404 = { status: 404 };
      expect(isRetryableError(error404)).toBe(false);
    });

    it('should not identify 2xx/3xx status codes as retryable', () => {
      const error = { status: 200 };
      expect(isRetryableError(error)).toBe(false);

      const error302 = { status: 302 };
      expect(isRetryableError(error302)).toBe(false);
    });

    it('should not identify generic errors as retryable', () => {
      const error = new Error('Something went wrong');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should handle non-error objects', () => {
      expect(isRetryableError('string error')).toBe(false);
      expect(isRetryableError(123)).toBe(false);
      expect(isRetryableError(null)).toBe(false);
      expect(isRetryableError(undefined)).toBe(false);
    });
  });
});

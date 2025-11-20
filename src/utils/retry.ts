import { logger } from './logger';

export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2
};

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff
 */
function calculateDelay(attempt: number, options: RetryOptions): number {
  const delay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt - 1);
  return Math.min(delay, options.maxDelayMs);
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  context = 'Operation'
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | unknown;

  for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === opts.maxRetries) {
        logger.error(`${context} failed after ${opts.maxRetries} attempts`, error);
        throw error;
      }

      const delay = calculateDelay(attempt, opts);
      logger.warn(
        `${context} failed (attempt ${attempt}/${opts.maxRetries}), retrying in ${delay}ms`,
        { error: error instanceof Error ? error.message : String(error) }
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Check if an error is retryable (typically network or 5xx errors)
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Network errors
    if (message.includes('network') ||
        message.includes('timeout') ||
        message.includes('econnrefused') ||
        message.includes('econnreset')) {
      return true;
    }
  }

  // HTTP 5xx errors and rate limiting (429)
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: number }).status;
    return (status >= 500 && status < 600) || status === 429;
  }

  return false;
}

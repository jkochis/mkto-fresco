import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../utils/logger';
import { retry, isRetryableError } from '../utils/retry';
import { toMarketoFormat } from '../utils/date';
import {
  MarketoAuthResponse,
  MarketoEmail,
  MarketoEmailContent,
  MarketoListResponse,
  MarketoSingleResponse,
  EmailActivityType,
  MarketoActivityType,
  MarketoBulkExtractJob
} from './types';

export interface MarketoClientConfig {
  clientId: string;
  clientSecret: string;
  endpoint: string;
}

export class MarketoClient {
  private config: MarketoClientConfig;
  private httpClient: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(config: MarketoClientConfig) {
    this.config = config;
    this.httpClient = axios.create({
      baseURL: config.endpoint,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Authenticate and get access token using OAuth2
   */
  private async authenticate(): Promise<void> {
    try {
      logger.debug('Authenticating with Marketo API');

      const response = await this.httpClient.get<MarketoAuthResponse>(
        '/identity/oauth/token',
        {
          params: {
            grant_type: 'client_credentials',
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret
          }
        }
      );

      this.accessToken = response.data.access_token;
      // Set expiration to 5 minutes before actual expiry for safety
      this.tokenExpiresAt = Date.now() + (response.data.expires_in - 300) * 1000;

      logger.info('Successfully authenticated with Marketo API');
    } catch (error) {
      logger.error('Failed to authenticate with Marketo API', error);
      throw new Error(`Marketo authentication failed: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.accessToken || Date.now() >= this.tokenExpiresAt) {
      await this.authenticate();
    }
  }

  /**
   * Make an authenticated request to Marketo API
   */
  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    params?: Record<string, unknown>,
    data?: unknown
  ): Promise<T> {
    await this.ensureAuthenticated();

    return retry(
      async () => {
        try {
          const response = await this.httpClient.request<T>({
            method,
            url: path,
            params,
            data,
            headers: {
              Authorization: `Bearer ${this.accessToken}`
            }
          });

          return response.data;
        } catch (error) {
          if (this.isAuthError(error)) {
            // Token might have expired, try re-authenticating once
            logger.warn('Auth error, attempting to re-authenticate');
            this.accessToken = null;
            await this.authenticate();

            // Retry the request with new token
            const response = await this.httpClient.request<T>({
              method,
              url: path,
              params,
              data,
              headers: {
                Authorization: `Bearer ${this.accessToken}`
              }
            });

            return response.data;
          }

          throw error;
        }
      },
      { maxRetries: 3 },
      `Marketo API ${method} ${path}`
    );
  }

  /**
   * Get list of emails
   */
  async getEmails(
    offset = 0,
    maxReturn = 200
  ): Promise<MarketoListResponse<MarketoEmail>> {
    logger.debug('Fetching emails from Marketo', { offset, maxReturn });

    return this.request<MarketoListResponse<MarketoEmail>>(
      'GET',
      '/rest/asset/v1/emails.json',
      {
        offset,
        maxReturn
      }
    );
  }

  /**
   * Get email by ID
   */
  async getEmailById(id: number): Promise<MarketoEmail | null> {
    logger.debug('Fetching email by ID', { id });

    const response = await this.request<MarketoSingleResponse<MarketoEmail>>(
      'GET',
      `/rest/asset/v1/email/${id}.json`
    );

    return response.result?.[0] || null;
  }

  /**
   * Get email content (HTML and text)
   */
  async getEmailContent(id: number): Promise<MarketoEmailContent | null> {
    logger.debug('Fetching email content', { id });

    try {
      const response = await this.request<MarketoSingleResponse<{ htmlContent: string; textContent?: string }>>(
        'GET',
        `/rest/asset/v1/email/${id}/content.json`
      );

      if (!response.result?.[0]) {
        return null;
      }

      const content = response.result[0];

      // Also get email metadata for subject, from, etc.
      const email = await this.getEmailById(id);

      return {
        id,
        htmlContent: content.htmlContent,
        textContent: content.textContent,
        subject: email?.subject?.value,
        fromName: email?.fromName?.value,
        fromEmail: email?.fromEmail?.value
      };
    } catch (error) {
      logger.warn(`Failed to fetch content for email ${id}`, error);
      return null;
    }
  }

  /**
   * Get activity types (for understanding what activities are available)
   */
  async getActivityTypes(): Promise<MarketoActivityType[]> {
    logger.debug('Fetching activity types');

    const response = await this.request<MarketoListResponse<MarketoActivityType>>(
      'GET',
      '/rest/v1/activities/types.json'
    );

    return response.result || [];
  }

  /**
   * Create a bulk extract job for activities
   */
  async createActivityExtractJob(
    activityTypeIds: number[],
    startDate: Date,
    endDate: Date
  ): Promise<string> {
    logger.info('Creating bulk activity extract job', {
      activityTypeIds,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    });

    const response = await this.request<{ result: [{ exportId: string }] }>(
      'POST',
      '/bulk/v1/activities/export/create.json',
      undefined,
      {
        filter: {
          createdAt: {
            startAt: toMarketoFormat(startDate),
            endAt: toMarketoFormat(endDate)
          },
          activityTypeIds
        },
        format: 'CSV',
        fields: [
          'marketoGUID',
          'leadId',
          'activityDate',
          'activityTypeId',
          'primaryAttributeValueId',
          'primaryAttributeValue',
          'campaign Id',
          'campaign Name'
        ]
      }
    );

    const exportId = response.result?.[0]?.exportId;
    if (!exportId) {
      throw new Error('Failed to create bulk extract job');
    }

    logger.info('Created bulk extract job', { exportId });
    return exportId;
  }

  /**
   * Enqueue a bulk extract job
   */
  async enqueueExtractJob(exportId: string): Promise<void> {
    logger.debug('Enqueueing extract job', { exportId });

    await this.request(
      'POST',
      `/bulk/v1/activities/export/${exportId}/enqueue.json`
    );

    logger.info('Extract job enqueued', { exportId });
  }

  /**
   * Get status of a bulk extract job
   */
  async getExtractJobStatus(exportId: string): Promise<MarketoBulkExtractJob> {
    const response = await this.request<{ result: [MarketoBulkExtractJob] }>(
      'GET',
      `/bulk/v1/activities/export/${exportId}/status.json`
    );

    const job = response.result?.[0];
    if (!job) {
      throw new Error(`Extract job ${exportId} not found`);
    }

    return job;
  }

  /**
   * Download bulk extract job results
   */
  async downloadExtractJobResults(exportId: string): Promise<string> {
    logger.debug('Downloading extract job results', { exportId });

    await this.ensureAuthenticated();

    const response = await this.httpClient.get(
      `/bulk/v1/activities/export/${exportId}/file.json`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`
        },
        responseType: 'text'
      }
    );

    return response.data;
  }

  /**
   * Wait for a bulk extract job to complete
   */
  async waitForExtractJob(exportId: string, maxWaitSeconds = 300): Promise<MarketoBulkExtractJob> {
    const startTime = Date.now();
    const pollIntervalMs = 5000; // Poll every 5 seconds

    while (Date.now() - startTime < maxWaitSeconds * 1000) {
      const job = await this.getExtractJobStatus(exportId);

      if (job.status === 'Completed') {
        logger.info('Extract job completed', { exportId });
        return job;
      }

      if (job.status === 'Failed' || job.status === 'Cancelled') {
        throw new Error(`Extract job ${exportId} ${job.status.toLowerCase()}`);
      }

      logger.debug('Extract job still processing', { exportId, status: job.status });
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Extract job ${exportId} timed out after ${maxWaitSeconds} seconds`);
  }

  /**
   * Get all emails modified since a certain date
   */
  async getEmailsSince(since: Date): Promise<MarketoEmail[]> {
    logger.info('Fetching emails modified since', { since: since.toISOString() });

    const allEmails: MarketoEmail[] = [];
    let offset = 0;
    const maxReturn = 200;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getEmails(offset, maxReturn);

      if (!response.success || !response.result) {
        logger.warn('Failed to fetch emails', { offset });
        break;
      }

      // Filter emails modified after the given date
      const recentEmails = response.result.filter(email => {
        const updatedAt = new Date(email.updatedAt);
        return updatedAt >= since;
      });

      allEmails.push(...recentEmails);

      hasMore = response.moreResult === true;
      offset += maxReturn;

      logger.debug('Fetched email batch', {
        offset,
        count: response.result.length,
        recentCount: recentEmails.length,
        hasMore
      });
    }

    logger.info('Finished fetching emails', { total: allEmails.length });
    return allEmails;
  }

  /**
   * Extract error message from axios error
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof AxiosError) {
      if (error.response?.data) {
        const data = error.response.data;
        if (data.errors && Array.isArray(data.errors)) {
          return data.errors.map((e: { message: string }) => e.message).join(', ');
        }
        if (typeof data === 'string') {
          return data;
        }
      }
      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  /**
   * Check if error is an authentication error
   */
  private isAuthError(error: unknown): boolean {
    if (error instanceof AxiosError) {
      return error.response?.status === 401;
    }
    return false;
  }
}

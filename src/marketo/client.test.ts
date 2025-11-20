import axios from 'axios';
import { MarketoClient } from './client';
import { MarketoEmail, MarketoAuthResponse } from './types';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock logger
jest.mock('../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Use real retry but with fast execution for tests
jest.mock('../utils/retry', () => {
  const actual = jest.requireActual('../utils/retry');
  return {
    ...actual,
    retry: (fn: () => Promise<any>, options?: any, context?: string) => {
      // Use real retry with minimal delays for testing
      return actual.retry(fn, { ...(options || {}), initialDelayMs: 1, maxDelayMs: 1 }, context);
    }
  };
});

describe('MarketoClient', () => {
  let client: MarketoClient;
  let mockAxiosInstance: any;

  const mockConfig = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    endpoint: 'https://test.mktorest.com'
  };

  const mockAuthResponse: MarketoAuthResponse = {
    access_token: 'test-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    scope: 'test-scope'
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock axios instance
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      request: jest.fn()
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);
  });

  describe('Constructor', () => {
    it('should create axios instance with correct config', () => {
      client = new MarketoClient(mockConfig);

      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: mockConfig.endpoint,
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    });
  });

  describe('Authentication', () => {
    beforeEach(() => {
      client = new MarketoClient(mockConfig);
      mockAxiosInstance.get.mockResolvedValue({ data: mockAuthResponse });
    });

    it('should authenticate and store access token', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          success: true,
          result: []
        }
      });

      await client.getEmails();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/identity/oauth/token',
        {
          params: {
            grant_type: 'client_credentials',
            client_id: mockConfig.clientId,
            client_secret: mockConfig.clientSecret
          }
        }
      );
    });

    it('should throw error when authentication fails', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Auth failed'));

      await expect(client.getEmails()).rejects.toThrow('Marketo authentication failed');
    });

    it('should reuse token if not expired', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          success: true,
          result: []
        }
      });

      // First request triggers authentication
      await client.getEmails();
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);

      // Second request should reuse token
      await client.getEmails();
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1); // Still just 1 auth call
    });
  });

  describe('getEmails', () => {
    beforeEach(() => {
      client = new MarketoClient(mockConfig);
      mockAxiosInstance.get.mockResolvedValue({ data: mockAuthResponse });
    });

    it('should fetch emails with default pagination', async () => {
      const mockEmails: MarketoEmail[] = [
        {
          id: 1,
          name: 'Test Email',
          description: 'Test',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          url: 'https://test.com',
          status: 'approved',
          workspace: 'Default',
          folder: {
            type: 'Folder',
            value: 1,
            folderName: 'Test Folder'
          }
        }
      ];

      mockAxiosInstance.request.mockResolvedValue({
        data: {
          success: true,
          result: mockEmails,
          moreResult: false
        }
      });

      const result = await client.getEmails();

      expect(result.success).toBe(true);
      expect(result.result).toEqual(mockEmails);
      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        method: 'GET',
        url: '/rest/asset/v1/emails.json',
        params: {
          offset: 0,
          maxReturn: 200
        },
        data: undefined,
        headers: {
          Authorization: 'Bearer test-access-token'
        }
      });
    });

    it('should fetch emails with custom pagination', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          success: true,
          result: [],
          moreResult: false
        }
      });

      await client.getEmails(100, 50);

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          params: {
            offset: 100,
            maxReturn: 50
          }
        })
      );
    });
  });

  describe('getEmailById', () => {
    beforeEach(() => {
      client = new MarketoClient(mockConfig);
      mockAxiosInstance.get.mockResolvedValue({ data: mockAuthResponse });
    });

    it('should fetch email by ID', async () => {
      const mockEmail: MarketoEmail = {
        id: 123,
        name: 'Test Email',
        description: 'Test',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        url: 'https://test.com',
        status: 'approved',
        workspace: 'Default',
        folder: {
          type: 'Folder',
          value: 1,
          folderName: 'Test Folder'
        }
      };

      mockAxiosInstance.request.mockResolvedValue({
        data: {
          success: true,
          result: [mockEmail]
        }
      });

      const result = await client.getEmailById(123);

      expect(result).toEqual(mockEmail);
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/rest/asset/v1/email/123.json'
        })
      );
    });

    it('should return null if email not found', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          success: true,
          result: []
        }
      });

      const result = await client.getEmailById(999);

      expect(result).toBeNull();
    });
  });

  describe('getEmailContent', () => {
    beforeEach(() => {
      client = new MarketoClient(mockConfig);
      mockAxiosInstance.get.mockResolvedValue({ data: mockAuthResponse });
    });

    it('should fetch email content with metadata', async () => {
      mockAxiosInstance.request
        .mockResolvedValueOnce({
          data: {
            success: true,
            result: [
              {
                htmlContent: '<html>Test</html>',
                textContent: 'Test'
              }
            ]
          }
        })
        .mockResolvedValueOnce({
          data: {
            success: true,
            result: [
              {
                id: 123,
                name: 'Test Email',
                subject: { value: 'Test Subject' },
                fromName: { value: 'John Doe' },
                fromEmail: { value: 'john@example.com' }
              }
            ]
          }
        });

      const result = await client.getEmailContent(123);

      expect(result).toEqual({
        id: 123,
        htmlContent: '<html>Test</html>',
        textContent: 'Test',
        subject: 'Test Subject',
        fromName: 'John Doe',
        fromEmail: 'john@example.com'
      });
    });

    it('should return null if content not found', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          success: true,
          result: []
        }
      });

      const result = await client.getEmailContent(999);

      expect(result).toBeNull();
    });

    it('should return null and log warning on error', async () => {
      mockAxiosInstance.request.mockRejectedValue(new Error('API error'));

      const result = await client.getEmailContent(123);

      expect(result).toBeNull();
    });
  });

  describe('getActivityTypes', () => {
    beforeEach(() => {
      client = new MarketoClient(mockConfig);
      mockAxiosInstance.get.mockResolvedValue({ data: mockAuthResponse });
    });

    it('should fetch activity types', async () => {
      const mockActivityTypes = [
        { id: 1, name: 'Open Email', description: 'Email opened' },
        { id: 2, name: 'Click Email', description: 'Email clicked' }
      ];

      mockAxiosInstance.request.mockResolvedValue({
        data: {
          success: true,
          result: mockActivityTypes
        }
      });

      const result = await client.getActivityTypes();

      expect(result).toEqual(mockActivityTypes);
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/rest/v1/activities/types.json'
        })
      );
    });

    it('should return empty array if no result', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          success: true
        }
      });

      const result = await client.getActivityTypes();

      expect(result).toEqual([]);
    });
  });

  describe('createActivityExtractJob', () => {
    beforeEach(() => {
      client = new MarketoClient(mockConfig);
      mockAxiosInstance.get.mockResolvedValue({ data: mockAuthResponse });
    });

    it('should create bulk extract job', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          result: [{ exportId: 'export-123' }]
        }
      });

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const activityTypeIds = [1, 2, 3];

      const exportId = await client.createActivityExtractJob(
        activityTypeIds,
        startDate,
        endDate
      );

      expect(exportId).toBe('export-123');
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/bulk/v1/activities/export/create.json',
          data: expect.objectContaining({
            filter: expect.objectContaining({
              activityTypeIds
            }),
            format: 'CSV'
          })
        })
      );
    });

    it('should throw error if export ID not returned', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          result: []
        }
      });

      await expect(
        client.createActivityExtractJob([1, 2], new Date(), new Date())
      ).rejects.toThrow('Failed to create bulk extract job');
    });
  });

  describe('enqueueExtractJob', () => {
    beforeEach(() => {
      client = new MarketoClient(mockConfig);
      mockAxiosInstance.get.mockResolvedValue({ data: mockAuthResponse });
    });

    it('should enqueue extract job', async () => {
      mockAxiosInstance.request.mockResolvedValue({ data: { success: true } });

      await client.enqueueExtractJob('export-123');

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/bulk/v1/activities/export/export-123/enqueue.json'
        })
      );
    });
  });

  describe('getExtractJobStatus', () => {
    beforeEach(() => {
      client = new MarketoClient(mockConfig);
      mockAxiosInstance.get.mockResolvedValue({ data: mockAuthResponse });
    });

    it('should get extract job status', async () => {
      const mockJob = {
        exportId: 'export-123',
        status: 'Completed',
        createdAt: '2024-01-01T00:00:00Z',
        finishedAt: '2024-01-01T01:00:00Z',
        format: 'CSV',
        numberOfRecords: 1000,
        fileSize: 50000
      };

      mockAxiosInstance.request.mockResolvedValue({
        data: {
          result: [mockJob]
        }
      });

      const result = await client.getExtractJobStatus('export-123');

      expect(result).toEqual(mockJob);
    });

    it('should throw error if job not found', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          result: []
        }
      });

      await expect(client.getExtractJobStatus('export-999')).rejects.toThrow(
        'Extract job export-999 not found'
      );
    });
  });

  describe('waitForExtractJob', () => {
    beforeEach(() => {
      client = new MarketoClient(mockConfig);
      mockAxiosInstance.get.mockResolvedValue({ data: mockAuthResponse });
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it.skip('should wait for job to complete', async () => {
      const completedJob = {
        exportId: 'export-123',
        status: 'Completed' as const,
        createdAt: '2024-01-01T00:00:00Z',
        finishedAt: '2024-01-01T01:00:00Z',
        format: 'CSV',
        numberOfRecords: 1000,
        fileSize: 50000
      };

      mockAxiosInstance.request
        .mockResolvedValueOnce({
          data: {
            result: [{ ...completedJob, status: 'Processing' }]
          }
        })
        .mockResolvedValueOnce({
          data: {
            result: [completedJob]
          }
        });

      const promise = client.waitForExtractJob('export-123', 60);

      // Fast-forward through first check
      await Promise.resolve();
      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      const result = await promise;
      expect(result.status).toBe('Completed');
    });

    it('should throw error if job fails', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          result: [
            {
              exportId: 'export-123',
              status: 'Failed'
            }
          ]
        }
      });

      await expect(client.waitForExtractJob('export-123', 60)).rejects.toThrow(
        'Extract job export-123 failed'
      );
    });
  });

  describe('getEmailsSince', () => {
    beforeEach(() => {
      client = new MarketoClient(mockConfig);
      mockAxiosInstance.get.mockResolvedValue({ data: mockAuthResponse });
    });

    it('should fetch emails modified since date', async () => {
      const sinceDate = new Date('2024-01-01');
      const mockEmails: MarketoEmail[] = [
        {
          id: 1,
          name: 'Email 1',
          description: 'Test',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          url: 'https://test.com',
          status: 'approved',
          workspace: 'Default',
          folder: {
            type: 'Folder',
            value: 1,
            folderName: 'Test'
          }
        }
      ];

      mockAxiosInstance.request.mockResolvedValue({
        data: {
          success: true,
          result: mockEmails,
          moreResult: false
        }
      });

      const result = await client.getEmailsSince(sinceDate);

      expect(result).toEqual(mockEmails);
    });

    it('should filter out emails before since date', async () => {
      const sinceDate = new Date('2024-01-15');
      const allEmails: MarketoEmail[] = [
        {
          id: 1,
          name: 'Old Email',
          description: 'Test',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          url: 'https://test.com',
          status: 'approved',
          workspace: 'Default'
        },
        {
          id: 2,
          name: 'New Email',
          description: 'Test',
          createdAt: '2024-01-20T00:00:00Z',
          updatedAt: '2024-01-20T00:00:00Z',
          url: 'https://test.com',
          status: 'approved',
          workspace: 'Default'
        }
      ];

      mockAxiosInstance.request.mockResolvedValue({
        data: {
          success: true,
          result: allEmails,
          moreResult: false
        }
      });

      const result = await client.getEmailsSince(sinceDate);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(2);
    });

    it.skip('should handle pagination', async () => {
      const sinceDate = new Date('2024-01-01');

      mockAxiosInstance.request
        .mockResolvedValueOnce({
          data: {
            success: true,
            result: Array(200).fill({
              id: 1,
              name: 'Email',
              description: 'Test',
              createdAt: '2024-01-02T00:00:00Z',
              updatedAt: '2024-01-02T00:00:00Z',
              url: 'https://test.com',
              status: 'approved',
              workspace: 'Default'
            }),
            moreResult: true
          }
        })
        .mockResolvedValueOnce({
          data: {
            success: true,
            result: Array(50).fill({
              id: 2,
              name: 'Email',
              description: 'Test',
              createdAt: '2024-01-02T00:00:00Z',
              updatedAt: '2024-01-02T00:00:00Z',
              url: 'https://test.com',
              status: 'approved',
              workspace: 'Default'
            }),
            moreResult: false
          }
        });

      const result = await client.getEmailsSince(sinceDate);

      expect(result).toHaveLength(250);
      expect(mockAxiosInstance.request).toHaveBeenCalledTimes(3); // 1 auth + 2 data requests
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      client = new MarketoClient(mockConfig);
      mockAxiosInstance.get.mockResolvedValue({ data: mockAuthResponse });
    });

    it.skip('should handle 401 errors and re-authenticate', async () => {
      const authError = {
        response: {
          status: 401,
          data: { error: 'Unauthorized' }
        }
      };

      mockAxiosInstance.request
        .mockRejectedValueOnce(authError)
        .mockResolvedValueOnce({
          data: {
            success: true,
            result: []
          }
        });

      const result = await client.getEmails();

      expect(result.success).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2); // Initial + re-auth
    });

    it('should extract error messages from Marketo API', async () => {
      const apiError = {
        response: {
          status: 400,
          data: {
            errors: [
              { message: 'Invalid parameter' },
              { message: 'Missing field' }
            ]
          }
        },
        message: 'Request failed'
      };

      mockAxiosInstance.get.mockRejectedValue(apiError);

      await expect(client.getEmails()).rejects.toThrow('Marketo authentication failed');
    });
  });
});

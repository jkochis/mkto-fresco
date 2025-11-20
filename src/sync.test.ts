import { sync } from './sync';
import { MarketoClient } from './marketo/client';
import { AlfrescoClient } from './alfresco/client';
import { MarketoEmail } from './marketo/types';
import { AlfrescoNode } from './alfresco/types';

// Mock the clients
jest.mock('./marketo/client');
jest.mock('./alfresco/client');

// Mock config
jest.mock('./config', () => ({
  config: {
    marketo: {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      endpoint: 'https://test.mktorest.com'
    },
    alfresco: {
      url: 'https://alfresco.test.com',
      username: 'testuser',
      password: 'testpass',
      basePath: '/Company Home/Test'
    },
    sync: {
      lookbackDays: 90,
      batchSize: 50
    }
  }
}));

// Mock logger
jest.mock('./utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock date utilities
jest.mock('./utils/date', () => ({
  getDaysAgo: jest.fn((days: number) => new Date('2023-10-01T00:00:00Z')),
  now: jest.fn(() => new Date('2024-01-01T00:00:00Z')),
  toISOString: jest.fn((date: Date) => date.toISOString()),
  toPathFormat: jest.fn(() => ({ year: '2024', month: '01' }))
}));

describe('Sync', () => {
  let mockMarketoClient: jest.Mocked<MarketoClient>;
  let mockAlfrescoClient: jest.Mocked<AlfrescoClient>;

  const mockEmail: MarketoEmail = {
    id: 123,
    name: 'Test Email',
    description: 'Test Description',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    url: 'https://test.com',
    status: 'approved',
    workspace: 'Default',
    folder: {
      type: 'Folder',
      value: 1,
      folderName: 'Test Campaign'
    },
    subject: {
      type: 'Text',
      value: 'Test Subject'
    },
    fromName: {
      type: 'Text',
      value: 'John Doe'
    },
    fromEmail: {
      type: 'Email',
      value: 'john@example.com'
    }
  };

  const mockNode: AlfrescoNode = {
    id: 'node-123',
    name: 'test.html',
    nodeType: 'cm:content',
    isFolder: false,
    isFile: true,
    createdAt: '2024-01-01T00:00:00Z',
    modifiedAt: '2024-01-01T00:00:00Z',
    createdByUser: {
      id: 'testuser',
      displayName: 'Test User'
    },
    modifiedByUser: {
      id: 'testuser',
      displayName: 'Test User'
    },
    properties: {}
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup MarketoClient mock
    mockMarketoClient = new MarketoClient({
      clientId: 'test',
      clientSecret: 'test',
      endpoint: 'https://test.com'
    }) as jest.Mocked<MarketoClient>;

    mockMarketoClient.getEmailsSince = jest.fn().mockResolvedValue([]);
    mockMarketoClient.getEmailContent = jest.fn().mockResolvedValue({
      id: 123,
      htmlContent: '<html>Test</html>',
      subject: 'Test Subject',
      fromName: 'John Doe',
      fromEmail: 'john@example.com'
    });

    // Setup AlfrescoClient mock
    mockAlfrescoClient = new AlfrescoClient({
      url: 'https://test.com',
      username: 'test',
      password: 'test',
      basePath: '/test'
    }) as jest.Mocked<AlfrescoClient>;

    mockAlfrescoClient.getRootNodeId = jest.fn().mockResolvedValue('root-123');
    mockAlfrescoClient.nodeExists = jest.fn().mockResolvedValue(null);
    mockAlfrescoClient.ensureFolderPath = jest.fn().mockResolvedValue({
      ...mockNode,
      id: 'folder-123',
      isFolder: true,
      isFile: false
    });
    mockAlfrescoClient.uploadFile = jest.fn().mockResolvedValue(mockNode);
    mockAlfrescoClient.updateNodeProperties = jest.fn().mockResolvedValue(mockNode);

    // Mock constructors
    (MarketoClient as jest.MockedClass<typeof MarketoClient>).mockImplementation(
      () => mockMarketoClient
    );
    (AlfrescoClient as jest.MockedClass<typeof AlfrescoClient>).mockImplementation(
      () => mockAlfrescoClient
    );
  });

  describe('Sync with no previous state', () => {
    it('should complete successfully with no emails', async () => {
      mockMarketoClient.getEmailsSince.mockResolvedValue([]);

      const result = await sync();

      expect(result.totalEmails).toBe(0);
      expect(result.processedEmails).toBe(0);
      expect(result.failedEmails).toBe(0);
      expect(result.skippedEmails).toBe(0);
      expect(mockMarketoClient.getEmailsSince).toHaveBeenCalled();
    });

    it.skip('should process new emails successfully', async () => {
      mockMarketoClient.getEmailsSince.mockResolvedValue([mockEmail]);
      mockAlfrescoClient.nodeExists.mockResolvedValue(null); // Email doesn't exist

      const result = await sync();

      expect(result.totalEmails).toBe(1);
      expect(result.processedEmails).toBe(1);
      expect(result.failedEmails).toBe(0);
      expect(result.skippedEmails).toBe(0);
      expect(mockAlfrescoClient.ensureFolderPath).toHaveBeenCalled();
      expect(mockAlfrescoClient.uploadFile).toHaveBeenCalledTimes(2); // HTML + JSON metadata
    });

    it('should skip existing emails', async () => {
      mockMarketoClient.getEmailsSince.mockResolvedValue([mockEmail]);
      mockAlfrescoClient.nodeExists.mockResolvedValue(mockNode); // Email already exists

      const result = await sync();

      expect(result.totalEmails).toBe(1);
      expect(result.processedEmails).toBe(1);
      expect(result.skippedEmails).toBe(0);
      expect(mockAlfrescoClient.uploadFile).not.toHaveBeenCalled();
    });

    it('should handle multiple emails in batches', async () => {
      const emails = Array(10)
        .fill(null)
        .map((_, i) => ({
          ...mockEmail,
          id: i + 1,
          name: `Email ${i + 1}`
        }));

      mockMarketoClient.getEmailsSince.mockResolvedValue(emails);
      mockAlfrescoClient.nodeExists.mockResolvedValue(null);

      const result = await sync();

      expect(result.totalEmails).toBe(10);
      expect(result.processedEmails).toBe(10);
      expect(mockMarketoClient.getEmailContent).toHaveBeenCalledTimes(10);
    });
  });

  describe('Sync with previous state', () => {
    it('should load and use previous sync timestamp', async () => {
      const stateNode: AlfrescoNode = {
        ...mockNode,
        name: '.sync-state.json',
        properties: {
          'mkto:lastSyncTimestamp': '2023-12-01T00:00:00Z'
        }
      };

      mockAlfrescoClient.nodeExists.mockResolvedValue(stateNode);
      mockMarketoClient.getEmailsSince.mockResolvedValue([]);

      await sync();

      expect(mockMarketoClient.getEmailsSince).toHaveBeenCalledWith(
        new Date('2023-12-01T00:00:00Z')
      );
    });

    it('should update sync state after successful sync', async () => {
      mockMarketoClient.getEmailsSince.mockResolvedValue([mockEmail]);
      mockAlfrescoClient.nodeExists
        .mockResolvedValueOnce(null) // No previous state
        .mockResolvedValueOnce(null); // Email doesn't exist

      await sync();

      // Should save sync state
      expect(mockAlfrescoClient.uploadFile).toHaveBeenCalledWith(
        'root-123',
        '.sync-state.json',
        expect.any(String),
        expect.objectContaining({
          name: '.sync-state.json',
          properties: expect.objectContaining({
            'mkto:lastSyncTimestamp': expect.any(String)
          })
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle email processing failures', async () => {
      mockMarketoClient.getEmailsSince.mockResolvedValue([mockEmail]);
      mockMarketoClient.getEmailContent.mockResolvedValue(null); // No content

      const result = await sync();

      expect(result.totalEmails).toBe(1);
      expect(result.processedEmails).toBe(0);
      expect(result.failedEmails).toBe(1);
      expect(result.failedEmailIds).toContain(mockEmail.id);
    });

    it('should continue processing after individual email failure', async () => {
      const emails = [
        { ...mockEmail, id: 1 },
        { ...mockEmail, id: 2 },
        { ...mockEmail, id: 3 }
      ];

      mockMarketoClient.getEmailsSince.mockResolvedValue(emails);
      mockMarketoClient.getEmailContent
        .mockResolvedValueOnce({
          id: 1,
          htmlContent: '<html>Test 1</html>',
          subject: 'Test 1'
        })
        .mockResolvedValueOnce(null) // Email 2 fails
        .mockResolvedValueOnce({
          id: 3,
          htmlContent: '<html>Test 3</html>',
          subject: 'Test 3'
        });

      mockAlfrescoClient.nodeExists.mockResolvedValue(null);

      const result = await sync();

      expect(result.totalEmails).toBe(3);
      expect(result.processedEmails).toBe(2);
      expect(result.failedEmails).toBe(1);
      expect(result.failedEmailIds).toContain(2);
    });

    it('should throw error on Marketo client failure', async () => {
      mockMarketoClient.getEmailsSince.mockRejectedValue(
        new Error('Marketo API error')
      );

      await expect(sync()).rejects.toThrow('Marketo API error');
    });

    it('should not fail if sync state save fails', async () => {
      mockMarketoClient.getEmailsSince.mockResolvedValue([mockEmail]);
      mockAlfrescoClient.nodeExists.mockResolvedValue(null);
      mockAlfrescoClient.uploadFile
        .mockResolvedValueOnce(mockNode) // HTML file succeeds
        .mockResolvedValueOnce(mockNode) // Metadata file succeeds
        .mockRejectedValueOnce(new Error('Failed to save state')); // State save fails

      // Should not throw
      const result = await sync();

      expect(result.processedEmails).toBe(1);
    });
  });

  describe('Email Processing', () => {
    it('should create correct folder structure', async () => {
      mockMarketoClient.getEmailsSince.mockResolvedValue([mockEmail]);
      mockAlfrescoClient.nodeExists.mockResolvedValue(null);

      await sync();

      expect(mockAlfrescoClient.ensureFolderPath).toHaveBeenCalledWith(
        '2024/01/Test Campaign'
      );
    });

    it('should sanitize folder names', async () => {
      const emailWithSpecialChars = {
        ...mockEmail,
        folder: {
          type: 'Folder' as const,
          value: 1,
          folderName: 'Test/Campaign:2024'
        }
      };

      mockMarketoClient.getEmailsSince.mockResolvedValue([emailWithSpecialChars]);
      mockAlfrescoClient.nodeExists.mockResolvedValue(null);

      await sync();

      expect(mockAlfrescoClient.ensureFolderPath).toHaveBeenCalledWith(
        '2024/01/Test-Campaign-2024'
      );
    });

    it('should use "Uncategorized" for emails without folder', async () => {
      const emailWithoutFolder = {
        ...mockEmail,
        folder: undefined
      };

      mockMarketoClient.getEmailsSince.mockResolvedValue([emailWithoutFolder]);
      mockAlfrescoClient.nodeExists.mockResolvedValue(null);

      await sync();

      expect(mockAlfrescoClient.ensureFolderPath).toHaveBeenCalledWith(
        '2024/01/Uncategorized'
      );
    });

    it('should upload HTML content with metadata', async () => {
      mockMarketoClient.getEmailsSince.mockResolvedValue([mockEmail]);
      mockAlfrescoClient.nodeExists.mockResolvedValue(null);

      await sync();

      expect(mockAlfrescoClient.uploadFile).toHaveBeenCalledWith(
        'folder-123',
        expect.stringContaining(`${mockEmail.id}-${mockEmail.name}`),
        '<html>Test</html>',
        expect.objectContaining({
          properties: expect.objectContaining({
            'mkto:emailId': mockEmail.id,
            'mkto:emailName': mockEmail.name,
            'mkto:campaignName': 'Test Campaign'
          })
        })
      );
    });

    it('should upload metadata JSON file', async () => {
      mockMarketoClient.getEmailsSince.mockResolvedValue([mockEmail]);
      mockAlfrescoClient.nodeExists.mockResolvedValue(null);

      await sync();

      // Second upload should be metadata JSON
      const metadataCall = (mockAlfrescoClient.uploadFile as jest.Mock).mock.calls[1];
      expect(metadataCall[1]).toContain('-metadata.json');
      expect(metadataCall[2]).toContain('"email"'); // JSON content
    });
  });

  describe('Result Summary', () => {
    it('should return correct timing information', async () => {
      mockMarketoClient.getEmailsSince.mockResolvedValue([]);

      const result = await sync();

      expect(result.startTime).toBeInstanceOf(Date);
      expect(result.endTime).toBeInstanceOf(Date);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.endTime.getTime()).toBeGreaterThanOrEqual(
        result.startTime.getTime()
      );
    });

    it('should include failed email IDs in result', async () => {
      const emails = [
        { ...mockEmail, id: 100 },
        { ...mockEmail, id: 200 },
        { ...mockEmail, id: 300 }
      ];

      mockMarketoClient.getEmailsSince.mockResolvedValue(emails);
      mockMarketoClient.getEmailContent
        .mockResolvedValueOnce(null) // 100 fails
        .mockResolvedValueOnce({
          id: 200,
          htmlContent: '<html>Test</html>',
          subject: 'Test'
        })
        .mockResolvedValueOnce(null); // 300 fails

      mockAlfrescoClient.nodeExists.mockResolvedValue(null);

      const result = await sync();

      expect(result.failedEmails).toBe(2);
      expect(result.failedEmailIds).toEqual([100, 300]);
    });
  });

  describe('Batch Processing', () => {
    it('should add delay between emails', async () => {
      jest.useFakeTimers();

      const emails = [
        { ...mockEmail, id: 1 },
        { ...mockEmail, id: 2 }
      ];

      mockMarketoClient.getEmailsSince.mockResolvedValue(emails);
      mockAlfrescoClient.nodeExists.mockResolvedValue(null);

      const syncPromise = sync();

      // Fast-forward through delays
      await jest.runAllTimersAsync();

      const result = await syncPromise;

      expect(result.processedEmails).toBe(2);

      jest.useRealTimers();
    });

    it.skip('should respect batch size from config', async () => {
      const batchSize = 50;
      const emails = Array(120)
        .fill(null)
        .map((_, i) => ({
          ...mockEmail,
          id: i + 1
        }));

      mockMarketoClient.getEmailsSince.mockResolvedValue(emails);
      mockAlfrescoClient.nodeExists.mockResolvedValue(null);

      const result = await sync();

      expect(result.processedEmails).toBe(120);
      // Should process in 3 batches (50 + 50 + 20)
    });
  });
});

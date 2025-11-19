import axios, { AxiosInstance, AxiosError } from 'axios';
import FormData from 'form-data';
import { logger } from '../utils/logger';
import { retry } from '../utils/retry';
import {
  AlfrescoAuthTicket,
  AlfrescoNode,
  AlfrescoNodeEntry,
  AlfrescoNodeList,
  AlfrescoCreateNodeRequest,
  AlfrescoUploadOptions,
  AlfrescoSearchRequest,
  AlfrescoSearchResults
} from './types';

export interface AlfrescoClientConfig {
  url: string;
  username: string;
  password: string;
  basePath: string;
}

export class AlfrescoClient {
  private config: AlfrescoClientConfig;
  private httpClient: AxiosInstance;
  private ticket: string | null = null;

  constructor(config: AlfrescoClientConfig) {
    this.config = config;
    this.httpClient = axios.create({
      baseURL: `${config.url}/alfresco/api/-default-/public/alfresco/versions/1`,
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Authenticate and get ticket
   */
  private async authenticate(): Promise<void> {
    try {
      logger.debug('Authenticating with Alfresco');

      const response = await axios.post<{ entry: AlfrescoAuthTicket }>(
        `${this.config.url}/alfresco/api/-default-/public/authentication/versions/1/tickets`,
        {
          userId: this.config.username,
          password: this.config.password
        }
      );

      this.ticket = response.data.entry.id;
      logger.info('Successfully authenticated with Alfresco');
    } catch (error) {
      logger.error('Failed to authenticate with Alfresco', error);
      throw new Error(`Alfresco authentication failed: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Ensure we have a valid ticket
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.ticket) {
      await this.authenticate();
    }
  }

  /**
   * Get authentication headers
   */
  private getAuthHeaders(): Record<string, string> {
    if (!this.ticket) {
      throw new Error('Not authenticated');
    }
    return {
      Authorization: `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`
    };
  }

  /**
   * Make an authenticated request
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    data?: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    await this.ensureAuthenticated();

    return retry(
      async () => {
        try {
          const response = await this.httpClient.request<T>({
            method,
            url: path,
            data,
            headers: {
              ...this.getAuthHeaders(),
              ...headers
            }
          });

          return response.data;
        } catch (error) {
          if (this.isAuthError(error)) {
            logger.warn('Auth error, attempting to re-authenticate');
            this.ticket = null;
            await this.authenticate();

            const response = await this.httpClient.request<T>({
              method,
              url: path,
              data,
              headers: {
                ...this.getAuthHeaders(),
                ...headers
              }
            });

            return response.data;
          }

          throw error;
        }
      },
      { maxRetries: 3 },
      `Alfresco API ${method} ${path}`
    );
  }

  /**
   * Get node by path
   */
  async getNodeByPath(path: string): Promise<AlfrescoNode | null> {
    try {
      logger.debug('Getting node by path', { path });

      // Encode path components
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');

      const response = await this.request<AlfrescoNodeEntry>(
        'GET',
        `/nodes/-root-?relativePath=${encodedPath}`
      );

      return response.entry;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a folder
   */
  async createFolder(
    parentId: string,
    name: string,
    properties?: Record<string, unknown>
  ): Promise<AlfrescoNode> {
    logger.debug('Creating folder', { parentId, name });

    const nodeData: AlfrescoCreateNodeRequest = {
      name,
      nodeType: 'cm:folder',
      properties
    };

    const response = await this.request<AlfrescoNodeEntry>(
      'POST',
      `/nodes/${parentId}/children`,
      nodeData
    );

    logger.info('Folder created', { id: response.entry.id, name });
    return response.entry;
  }

  /**
   * Create folder path (creates intermediate folders if needed)
   */
  async ensureFolderPath(path: string): Promise<AlfrescoNode> {
    logger.debug('Ensuring folder path exists', { path });

    // Start from root or base path
    let currentPath = this.config.basePath;
    let currentNode = await this.getNodeByPath(currentPath);

    if (!currentNode) {
      throw new Error(`Base path does not exist: ${this.config.basePath}`);
    }

    // Split the relative path and create each folder if needed
    const pathParts = path.split('/').filter(p => p.length > 0);

    for (const part of pathParts) {
      currentPath = `${currentPath}/${part}`;
      let node = await this.getNodeByPath(currentPath);

      if (!node) {
        // Folder doesn't exist, create it
        node = await this.createFolder(currentNode.id, part);
      }

      currentNode = node;
    }

    logger.info('Folder path ready', { path: currentPath, nodeId: currentNode.id });
    return currentNode;
  }

  /**
   * Upload a file
   */
  async uploadFile(
    parentId: string,
    fileName: string,
    content: string | Buffer,
    options: Partial<AlfrescoUploadOptions> = {}
  ): Promise<AlfrescoNode> {
    logger.debug('Uploading file', { parentId, fileName });

    await this.ensureAuthenticated();

    const formData = new FormData();
    formData.append('filedata', content, fileName);
    formData.append('name', options.name || fileName);
    formData.append('nodeType', options.nodeType || 'cm:content');

    if (options.properties) {
      formData.append('properties', JSON.stringify(options.properties));
    }

    if (options.relativePath) {
      formData.append('relativePath', options.relativePath);
    }

    if (options.overwrite !== undefined) {
      formData.append('overwrite', String(options.overwrite));
    }

    if (options.autoRename !== undefined) {
      formData.append('autoRename', String(options.autoRename));
    }

    return retry(
      async () => {
        try {
          const response = await this.httpClient.post<AlfrescoNodeEntry>(
            `/nodes/${parentId}/children`,
            formData,
            {
              headers: {
                ...this.getAuthHeaders(),
                ...formData.getHeaders()
              }
            }
          );

          logger.info('File uploaded', { id: response.data.entry.id, name: fileName });
          return response.data.entry;
        } catch (error) {
          if (this.isAuthError(error)) {
            logger.warn('Auth error during upload, re-authenticating');
            this.ticket = null;
            await this.authenticate();

            const response = await this.httpClient.post<AlfrescoNodeEntry>(
              `/nodes/${parentId}/children`,
              formData,
              {
                headers: {
                  ...this.getAuthHeaders(),
                  ...formData.getHeaders()
                }
              }
            );

            return response.data.entry;
          }

          throw error;
        }
      },
      { maxRetries: 3 },
      `Upload file ${fileName}`
    );
  }

  /**
   * Check if a node exists by name in a parent folder
   */
  async nodeExists(parentId: string, name: string): Promise<AlfrescoNode | null> {
    try {
      logger.debug('Checking if node exists', { parentId, name });

      const response = await this.request<AlfrescoNodeList>(
        'GET',
        `/nodes/${parentId}/children?where=(name='${encodeURIComponent(name)}')`
      );

      if (response.list.entries.length > 0) {
        return response.list.entries[0].entry;
      }

      return null;
    } catch (error) {
      logger.warn('Error checking if node exists', error);
      return null;
    }
  }

  /**
   * Update node properties
   */
  async updateNodeProperties(
    nodeId: string,
    properties: Record<string, unknown>
  ): Promise<AlfrescoNode> {
    logger.debug('Updating node properties', { nodeId, properties });

    const response = await this.request<AlfrescoNodeEntry>(
      'PUT',
      `/nodes/${nodeId}`,
      { properties }
    );

    logger.info('Node properties updated', { nodeId });
    return response.entry;
  }

  /**
   * Search for nodes
   */
  async search(query: string, maxItems = 100): Promise<AlfrescoNode[]> {
    logger.debug('Searching nodes', { query, maxItems });

    const searchRequest: AlfrescoSearchRequest = {
      query: {
        query,
        language: 'afts'
      },
      paging: {
        maxItems,
        skipCount: 0
      }
    };

    const response = await this.request<AlfrescoSearchResults>(
      'POST',
      '/search/versions/1/search',
      searchRequest
    );

    return response.list.entries.map(e => e.entry);
  }

  /**
   * Get the root node ID for the base path
   */
  async getRootNodeId(): Promise<string> {
    const node = await this.getNodeByPath(this.config.basePath);
    if (!node) {
      throw new Error(`Base path not found: ${this.config.basePath}`);
    }
    return node.id;
  }

  /**
   * Extract error message
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof AxiosError) {
      if (error.response?.data?.error) {
        return error.response.data.error.briefSummary || error.response.data.error.statusCode;
      }
      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  /**
   * Check if error is authentication error
   */
  private isAuthError(error: unknown): boolean {
    if (error instanceof AxiosError) {
      return error.response?.status === 401;
    }
    return false;
  }

  /**
   * Check if error is not found error
   */
  private isNotFoundError(error: unknown): boolean {
    if (error instanceof AxiosError) {
      return error.response?.status === 404;
    }
    return false;
  }
}

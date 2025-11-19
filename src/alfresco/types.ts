export interface AlfrescoAuthTicket {
  id: string;
  userId: string;
}

export interface AlfrescoNode {
  id: string;
  name: string;
  nodeType: string;
  isFolder: boolean;
  isFile: boolean;
  createdAt: string;
  modifiedAt: string;
  createdByUser: {
    id: string;
    displayName: string;
  };
  modifiedByUser: {
    id: string;
    displayName: string;
  };
  parentId?: string;
  path?: {
    name: string;
    elements: Array<{
      id: string;
      name: string;
    }>;
  };
  properties?: Record<string, unknown>;
}

export interface AlfrescoNodeEntry {
  entry: AlfrescoNode;
}

export interface AlfrescoNodeList {
  list: {
    pagination: {
      count: number;
      hasMoreItems: boolean;
      totalItems: number;
      skipCount: number;
      maxItems: number;
    };
    entries: AlfrescoNodeEntry[];
  };
}

export interface AlfrescoError {
  error: {
    errorKey?: string;
    statusCode: number;
    briefSummary: string;
    stackTrace?: string;
    descriptionURL?: string;
  };
}

export interface AlfrescoCreateNodeRequest {
  name: string;
  nodeType: string;
  properties?: Record<string, unknown>;
  relativePath?: string;
}

export interface AlfrescoUploadOptions {
  name: string;
  nodeType?: string;
  properties?: Record<string, unknown>;
  relativePath?: string;
  overwrite?: boolean;
  autoRename?: boolean;
}

export interface AlfrescoSearchRequest {
  query: {
    query: string;
    language?: 'afts' | 'cmis';
  };
  paging?: {
    maxItems?: number;
    skipCount?: number;
  };
  fields?: string[];
}

export interface AlfrescoSearchResults {
  list: {
    pagination: {
      count: number;
      hasMoreItems: boolean;
      totalItems: number;
      skipCount: number;
      maxItems: number;
    };
    entries: Array<{
      entry: AlfrescoNode & {
        search?: {
          score: number;
        };
      };
    }>;
  };
}

// Custom properties for Marketo email metadata
export interface MarketoEmailProperties {
  'mkto:emailId': number;
  'mkto:emailName': string;
  'mkto:campaignName': string;
  'mkto:subject'?: string;
  'mkto:fromName'?: string;
  'mkto:fromEmail'?: string;
  'mkto:createdAt': string;
  'mkto:updatedAt': string;
  'mkto:lastSyncedAt': string;
}

export interface MarketoAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface MarketoErrorResponse {
  requestId?: string;
  success: boolean;
  errors?: Array<{
    code: string;
    message: string;
  }>;
  warnings?: Array<{
    code: string;
    message: string;
  }>;
}

export interface MarketoEmail {
  id: number;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  url?: string;
  subject?: {
    type: string;
    value: string;
  };
  fromName?: {
    type: string;
    value: string;
  };
  fromEmail?: {
    type: string;
    value: string;
  };
  replyEmail?: {
    type: string;
    value: string;
  };
  folder?: {
    type: string;
    value: number;
    folderName: string;
  };
  operational?: boolean;
  textOnly?: boolean;
  publishToMSI?: boolean;
  webView?: boolean;
  status?: string;
  template?: number;
  workspace?: string;
  isOpenTrackingDisabled?: boolean;
  version?: number;
  autoCopyToText?: boolean;
  ccFields?: unknown;
  preHeader?: string;
}

export interface MarketoEmailContent {
  id: number;
  htmlContent?: string;
  textContent?: string;
  subject?: string;
  fromName?: string;
  fromEmail?: string;
}

export interface MarketoEmailActivity {
  id: number;
  leadId: number;
  activityDate: string;
  activityTypeId: number;
  primaryAttributeValueId: number;
  primaryAttributeValue: string;
  attributes: Array<{
    name: string;
    value: string | number | boolean;
  }>;
}

export interface MarketoActivityType {
  id: number;
  name: string;
  description: string;
  primaryAttribute: {
    name: string;
    dataType: string;
  };
  attributes: Array<{
    name: string;
    dataType: string;
  }>;
}

export interface MarketoBulkExtractJob {
  exportId: string;
  format: string;
  status: 'Created' | 'Queued' | 'Processing' | 'Cancelled' | 'Completed' | 'Failed';
  createdAt: string;
  queuedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  numberOfRecords?: number;
  fileSize?: number;
  fileChecksum?: string;
}

export interface MarketoEmailStats {
  emailId: number;
  emailName: string;
  sent: number;
  delivered: number;
  bounced: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
}

export interface MarketoListResponse<T> {
  requestId: string;
  success: boolean;
  result?: T[];
  errors?: Array<{
    code: string;
    message: string;
  }>;
  moreResult?: boolean;
  nextPageToken?: string;
}

export interface MarketoSingleResponse<T> {
  requestId: string;
  success: boolean;
  result?: T[];
  errors?: Array<{
    code: string;
    message: string;
  }>;
}

// Activity Type IDs for email activities
export enum EmailActivityType {
  SEND_EMAIL = 6,
  EMAIL_DELIVERED = 7,
  EMAIL_BOUNCED = 8,
  UNSUBSCRIBE_EMAIL = 9,
  OPEN_EMAIL = 10,
  CLICK_EMAIL = 11,
  EMAIL_BOUNCED_SOFT = 24
}

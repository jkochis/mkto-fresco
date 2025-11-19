import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export interface Config {
  marketo: {
    clientId: string;
    clientSecret: string;
    endpoint: string;
  };
  alfresco: {
    url: string;
    username: string;
    password: string;
    basePath: string;
  };
  sync: {
    lookbackDays: number;
    batchSize: number;
  };
}

function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name] || defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getEnvVarNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number, got: ${value}`);
  }
  return parsed;
}

export function loadConfig(): Config {
  return {
    marketo: {
      clientId: getEnvVar('MARKETO_CLIENT_ID'),
      clientSecret: getEnvVar('MARKETO_CLIENT_SECRET'),
      endpoint: getEnvVar('MARKETO_ENDPOINT')
    },
    alfresco: {
      url: getEnvVar('ALFRESCO_URL'),
      username: getEnvVar('ALFRESCO_USERNAME'),
      password: getEnvVar('ALFRESCO_PASSWORD'),
      basePath: getEnvVar('ALFRESCO_BASE_PATH', '/Company Home/Marketo Emails')
    },
    sync: {
      lookbackDays: getEnvVarNumber('SYNC_LOOKBACK_DAYS', 90),
      batchSize: getEnvVarNumber('SYNC_BATCH_SIZE', 50)
    }
  };
}

export const config = loadConfig();

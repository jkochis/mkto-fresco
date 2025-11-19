import { MarketoClient } from './marketo/client';
import { AlfrescoClient } from './alfresco/client';
import { config } from './config';
import { logger } from './utils/logger';
import { getDaysAgo, now, toISOString, toPathFormat } from './utils/date';
import { MarketoEmail, MarketoEmailContent } from './marketo/types';
import { AlfrescoNode } from './alfresco/types';

interface SyncResult {
  totalEmails: number;
  processedEmails: number;
  failedEmails: number;
  skippedEmails: number;
  failedEmailIds: number[];
  startTime: Date;
  endTime: Date;
  duration: number;
}

interface SyncState {
  lastSyncTimestamp: string | null;
}

/**
 * Load last sync timestamp from Alfresco metadata
 */
async function loadSyncState(alfrescoClient: AlfrescoClient): Promise<SyncState> {
  try {
    logger.info('Loading sync state');

    // Try to find a sync state file in Alfresco
    const rootNode = await alfrescoClient.getRootNodeId();
    const stateNode = await alfrescoClient.nodeExists(rootNode, '.sync-state.json');

    if (stateNode && stateNode.properties) {
      const lastSync = stateNode.properties['mkto:lastSyncTimestamp'] as string;
      if (lastSync) {
        logger.info('Found previous sync state', { lastSyncTimestamp: lastSync });
        return { lastSyncTimestamp: lastSync };
      }
    }

    logger.info('No previous sync state found, starting fresh');
    return { lastSyncTimestamp: null };
  } catch (error) {
    logger.warn('Failed to load sync state, starting fresh', error);
    return { lastSyncTimestamp: null };
  }
}

/**
 * Save sync timestamp to Alfresco
 */
async function saveSyncState(
  alfrescoClient: AlfrescoClient,
  timestamp: string
): Promise<void> {
  try {
    logger.info('Saving sync state', { timestamp });

    const rootNode = await alfrescoClient.getRootNodeId();
    const stateNode = await alfrescoClient.nodeExists(rootNode, '.sync-state.json');

    const properties = {
      'mkto:lastSyncTimestamp': timestamp
    };

    if (stateNode) {
      // Update existing state
      await alfrescoClient.updateNodeProperties(stateNode.id, properties);
    } else {
      // Create new state file
      await alfrescoClient.uploadFile(
        rootNode,
        '.sync-state.json',
        JSON.stringify({ lastSyncTimestamp: timestamp }, null, 2),
        {
          name: '.sync-state.json',
          properties
        }
      );
    }

    logger.info('Sync state saved successfully');
  } catch (error) {
    logger.error('Failed to save sync state', error);
    // Don't throw - this is not critical
  }
}

/**
 * Process a single email: fetch content and upload to Alfresco
 */
async function processEmail(
  marketoClient: MarketoClient,
  alfrescoClient: AlfrescoClient,
  email: MarketoEmail
): Promise<{ success: boolean; node?: AlfrescoNode }> {
  try {
    logger.debug('Processing email', { id: email.id, name: email.name });

    // Get email content
    const content = await marketoClient.getEmailContent(email.id);
    if (!content || !content.htmlContent) {
      logger.warn('Email has no HTML content', { id: email.id });
      return { success: false };
    }

    // Determine folder path: /Marketo Emails/{YYYY}/{MM}/{campaign-name}/
    const emailDate = new Date(email.createdAt);
    const { year, month } = toPathFormat(emailDate);

    // Use folder name from email if available, otherwise use email name
    const campaignName = email.folder?.folderName || 'Uncategorized';
    const sanitizedCampaignName = campaignName.replace(/[/\\:*?"<>|]/g, '-');

    const folderPath = `${year}/${month}/${sanitizedCampaignName}`;

    // Ensure folder path exists
    const folderNode = await alfrescoClient.ensureFolderPath(folderPath);

    // Check if email already exists
    const emailFileName = `${email.id}-${email.name.replace(/[/\\:*?"<>|]/g, '-')}.html`;
    const existingNode = await alfrescoClient.nodeExists(folderNode.id, emailFileName);

    if (existingNode) {
      logger.debug('Email already exists in Alfresco, skipping', {
        id: email.id,
        nodeId: existingNode.id
      });
      return { success: true, node: existingNode };
    }

    // Prepare metadata
    const metadata = {
      'mkto:emailId': email.id,
      'mkto:emailName': email.name,
      'mkto:campaignName': sanitizedCampaignName,
      'mkto:subject': content.subject || email.subject?.value,
      'mkto:fromName': content.fromName || email.fromName?.value,
      'mkto:fromEmail': content.fromEmail || email.fromEmail?.value,
      'mkto:createdAt': email.createdAt,
      'mkto:updatedAt': email.updatedAt,
      'mkto:lastSyncedAt': toISOString(now())
    };

    // Upload HTML content
    const htmlNode = await alfrescoClient.uploadFile(
      folderNode.id,
      emailFileName,
      content.htmlContent,
      {
        name: emailFileName,
        properties: metadata
      }
    );

    logger.info('Email uploaded successfully', {
      emailId: email.id,
      nodeId: htmlNode.id,
      path: folderPath
    });

    // Also upload metadata as JSON
    const metadataFileName = `${email.id}-${email.name.replace(/[/\\:*?"<>|]/g, '-')}-metadata.json`;
    const metadataContent = JSON.stringify(
      {
        email,
        content: {
          subject: content.subject,
          fromName: content.fromName,
          fromEmail: content.fromEmail
        }
      },
      null,
      2
    );

    await alfrescoClient.uploadFile(
      folderNode.id,
      metadataFileName,
      metadataContent,
      {
        name: metadataFileName,
        properties: {
          'mkto:emailId': email.id,
          'mkto:emailName': email.name
        }
      }
    );

    return { success: true, node: htmlNode };
  } catch (error) {
    logger.error('Failed to process email', {
      emailId: email.id,
      error: error instanceof Error ? error.message : String(error)
    });
    return { success: false };
  }
}

/**
 * Process emails in batches to avoid overwhelming the APIs
 */
async function processBatch(
  marketoClient: MarketoClient,
  alfrescoClient: AlfrescoClient,
  emails: MarketoEmail[],
  batchSize: number
): Promise<{ processed: number; failed: number; skipped: number; failedIds: number[] }> {
  let processed = 0;
  let failed = 0;
  let skipped = 0;
  const failedIds: number[] = [];

  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    logger.info(`Processing batch ${Math.floor(i / batchSize) + 1}`, {
      start: i,
      end: Math.min(i + batchSize, emails.length),
      total: emails.length
    });

    // Process batch items sequentially to avoid rate limiting
    for (const email of batch) {
      const result = await processEmail(marketoClient, alfrescoClient, email);

      if (result.success) {
        if (result.node) {
          processed++;
        } else {
          skipped++;
        }
      } else {
        failed++;
        failedIds.push(email.id);
      }

      // Small delay between emails to be respectful of rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logger.info(`Batch completed`, { processed, failed, skipped });
  }

  return { processed, failed, skipped, failedIds };
}

/**
 * Main sync function
 */
export async function sync(): Promise<SyncResult> {
  const startTime = now();
  logger.info('Starting Marketo to Alfresco sync');

  const result: SyncResult = {
    totalEmails: 0,
    processedEmails: 0,
    failedEmails: 0,
    skippedEmails: 0,
    failedEmailIds: [],
    startTime,
    endTime: startTime,
    duration: 0
  };

  try {
    // Initialize clients
    const marketoClient = new MarketoClient({
      clientId: config.marketo.clientId,
      clientSecret: config.marketo.clientSecret,
      endpoint: config.marketo.endpoint
    });

    const alfrescoClient = new AlfrescoClient({
      url: config.alfresco.url,
      username: config.alfresco.username,
      password: config.alfresco.password,
      basePath: config.alfresco.basePath
    });

    // Load sync state
    const syncState = await loadSyncState(alfrescoClient);

    // Determine lookback date
    let sinceDate: Date;
    if (syncState.lastSyncTimestamp) {
      sinceDate = new Date(syncState.lastSyncTimestamp);
      logger.info('Syncing emails since last sync', { sinceDate: sinceDate.toISOString() });
    } else {
      sinceDate = getDaysAgo(config.sync.lookbackDays);
      logger.info('First sync, looking back days', {
        days: config.sync.lookbackDays,
        sinceDate: sinceDate.toISOString()
      });
    }

    // Fetch emails from Marketo
    logger.info('Fetching emails from Marketo');
    const emails = await marketoClient.getEmailsSince(sinceDate);
    result.totalEmails = emails.length;

    logger.info('Fetched emails from Marketo', { count: emails.length });

    if (emails.length === 0) {
      logger.info('No new emails to sync');
      result.endTime = now();
      result.duration = result.endTime.getTime() - result.startTime.getTime();
      return result;
    }

    // Process emails in batches
    const batchResult = await processBatch(
      marketoClient,
      alfrescoClient,
      emails,
      config.sync.batchSize
    );

    result.processedEmails = batchResult.processed;
    result.failedEmails = batchResult.failed;
    result.skippedEmails = batchResult.skipped;
    result.failedEmailIds = batchResult.failedIds;

    // Save sync state
    const syncTimestamp = toISOString(startTime);
    await saveSyncState(alfrescoClient, syncTimestamp);

    result.endTime = now();
    result.duration = result.endTime.getTime() - result.startTime.getTime();

    logger.info('Sync completed', {
      total: result.totalEmails,
      processed: result.processedEmails,
      failed: result.failedEmails,
      skipped: result.skippedEmails,
      duration: `${Math.round(result.duration / 1000)}s`
    });

    return result;
  } catch (error) {
    logger.error('Sync failed with error', error);
    result.endTime = now();
    result.duration = result.endTime.getTime() - result.startTime.getTime();
    throw error;
  }
}

// Run sync if this file is executed directly
if (require.main === module) {
  sync()
    .then(result => {
      console.log('\n=== Sync Summary ===');
      console.log(`Total emails: ${result.totalEmails}`);
      console.log(`Processed: ${result.processedEmails}`);
      console.log(`Skipped (already exists): ${result.skippedEmails}`);
      console.log(`Failed: ${result.failedEmails}`);
      console.log(`Duration: ${Math.round(result.duration / 1000)}s`);

      if (result.failedEmailIds.length > 0) {
        console.log(`\nFailed email IDs: ${result.failedEmailIds.join(', ')}`);
        process.exit(1);
      }

      process.exit(0);
    })
    .catch(error => {
      console.error('Sync failed:', error);
      process.exit(1);
    });
}

Build a GitHub Actions workflow that syncs email activity data from Marketo to Alfresco for long-term retention.

REQUIREMENTS:
- TypeScript-based sync script with proper error handling
- GitHub Actions workflow with scheduled daily runs (2 AM UTC) and manual trigger
- Extract email activities from Marketo using their REST API (Bulk Extract API for large datasets)
- Upload emails and metadata to Alfresco using their REST API v1
- Track last sync timestamp to avoid re-processing
- Organize emails in Alfresco by date: /Marketo Emails/{YYYY}/{MM}/{campaign-name}/
- Store both email content (HTML) and metadata (JSON with delivery stats, opens, clicks)

TECHNICAL STACK:
- Node.js 20+ with TypeScript
- Axios or fetch for HTTP requests
- GitHub Actions for orchestration
- Environment variables for all credentials (via GitHub Secrets)

PROJECT STRUCTURE:
src/
  marketo/
    client.ts          # Marketo API client
    types.ts           # TypeScript types for Marketo responses
  alfresco/
    client.ts          # Alfresco API client  
    types.ts           # TypeScript types for Alfresco
  sync.ts              # Main sync orchestration
  config.ts            # Configuration management
  utils/
    date.ts            # Date utilities
    logger.ts          # Logging utilities
.github/
  workflows/
    sync.yml           # GitHub Actions workflow
package.json
tsconfig.json
.env.example

KEY FEATURES:
1. Marketo Client:
   - Authentication using OAuth2 (client_id/client_secret)
   - Fetch email activities (Delivered, Opened, Clicked) from last 90 days
   - Handle pagination for large datasets
   - Export email content and metadata
   - Respect API rate limits (50,000 daily API calls)

2. Alfresco Client:
   - Basic authentication or ticket-based auth
   - Create folder structure if it doesn't exist
   - Upload files via /nodes/{parentId}/children endpoint
   - Set custom metadata properties on nodes
   - Check if file already exists to avoid duplicates

3. Sync Logic:
   - Load last sync timestamp from GitHub Actions cache or Alfresco metadata
   - Query Marketo for emails since last sync
   - Transform Marketo data into Alfresco-compatible format
   - Batch upload to Alfresco (avoid overwhelming the API)
   - Update sync timestamp on success
   - Detailed logging for debugging

4. Error Handling:
   - Retry logic for transient API failures (3 retries with exponential backoff)
   - Graceful degradation (continue processing other emails if one fails)
   - Report failed items in workflow summary
   - Exit with error code if critical failure

5. GitHub Actions Workflow:
   - Scheduled trigger (cron)
   - Manual workflow_dispatch trigger
   - Secrets for all credentials
   - Cache node_modules for faster runs
   - Upload artifacts for failed email list (if any)
   - Slack/email notification on failure (optional)

ENVIRONMENT VARIABLES:
- MARKETO_CLIENT_ID
- MARKETO_CLIENT_SECRET  
- MARKETO_ENDPOINT (e.g., https://123-ABC-456.mktorest.com)
- ALFRESCO_URL (e.g., https://alfresco.company.com)
- ALFRESCO_USERNAME
- ALFRESCO_PASSWORD
- ALFRESCO_BASE_PATH (e.g., /Company Home/Marketo Emails)

EDGE CASES TO HANDLE:
- Marketo API rate limiting
- Large email batches (paginate/batch upload)
- Network timeouts
- Duplicate detection
- Missing or malformed email content
- Alfresco folder creation race conditions

OUTPUT:
- Complete working codebase with TypeScript
- Comprehensive README.md with setup instructions
- .env.example file
- GitHub Actions workflow YAML
- Basic unit tests for core functions
- Error logging and monitoring hooks

Start by scaffolding the project structure, then implement the Marketo client, followed by Alfresco client, and finally the sync orchestration logic.
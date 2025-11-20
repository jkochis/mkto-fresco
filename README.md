# Marketo to Alfresco Sync

[![GitHub Actions](https://img.shields.io/github/actions/workflow/status/jkochis/mkto-fresco/sync.yml?branch=main&logo=github&label=sync)](https://github.com/jkochis/mkto-fresco/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green?logo=node.js)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9+-orange?logo=pnpm)](https://pnpm.io/)
[![Tests](https://img.shields.io/badge/tests-109%20passing-success)](https://github.com/jkochis/mkto-fresco)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Code Style](https://img.shields.io/badge/code%20style-eslint-brightgreen?logo=eslint)](https://eslint.org/)

A TypeScript-based solution to sync email activity data from Marketo to Alfresco for long-term retention and archival.

## Features

- **Automated Sync**: Daily scheduled sync via GitHub Actions
- **Incremental Updates**: Tracks last sync timestamp to avoid re-processing
- **Organized Storage**: Emails organized in Alfresco by date: `/Marketo Emails/{YYYY}/{MM}/{campaign-name}/`
- **Rich Metadata**: Stores both email content (HTML) and metadata (JSON with delivery stats)
- **Robust Error Handling**: Retry logic with exponential backoff for transient failures
- **Rate Limit Friendly**: Respects Marketo's API rate limits (50,000 daily calls)
- **Batch Processing**: Processes emails in configurable batches to avoid overwhelming APIs

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌──────────────┐
│   Marketo   │─────▶│  GitHub      │─────▶│   Alfresco   │
│   REST API  │      │  Actions     │      │   REST API   │
└─────────────┘      └──────────────┘      └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │ TypeScript   │
                     │ Sync Script  │
                     └──────────────┘
```

## Prerequisites

- Node.js 20 or higher
- pnpm 9 or higher
- Marketo account with API access
- Alfresco instance with REST API access
- GitHub repository (for GitHub Actions)

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/jkochis/mkto-fresco
   cd mkto-fresco
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

4. Configure your environment variables in `.env` (see Configuration section below)

## Configuration

### Marketo API Credentials

1. Log into Marketo Admin
2. Navigate to **Admin** > **LaunchPoint**
3. Create or select an API service
4. Copy the **Client ID** and **Client Secret**
5. Note your **REST API Endpoint** (format: `https://XXX-XXX-XXX.mktorest.com`)

### Alfresco Configuration

1. Ensure you have an Alfresco user with permissions to:
   - Create folders
   - Upload files
   - Set metadata properties

2. Note your Alfresco instance URL (e.g., `https://alfresco.company.com`)

3. Create the base folder path in Alfresco (e.g., `/Company Home/Marketo Emails`)

### Environment Variables

Edit `.env` with your credentials:

```bash
# Marketo
MARKETO_CLIENT_ID=your_client_id
MARKETO_CLIENT_SECRET=your_client_secret
MARKETO_ENDPOINT=https://123-ABC-456.mktorest.com

# Alfresco
ALFRESCO_URL=https://alfresco.company.com
ALFRESCO_USERNAME=your_username
ALFRESCO_PASSWORD=your_password
ALFRESCO_BASE_PATH=/Company Home/Marketo Emails

# Sync Configuration
SYNC_LOOKBACK_DAYS=90
SYNC_BATCH_SIZE=50

# Logging
LOG_LEVEL=INFO
```

## Usage

### Local Development

Build the project:
```bash
pnpm run build
```

Run the sync:
```bash
pnpm start
```

Run in development mode (with ts-node):
```bash
pnpm run dev
```

### GitHub Actions Setup

1. Add secrets to your GitHub repository:
   - Go to **Settings** > **Secrets and variables** > **Actions**
   - Add the following secrets:
     - `MARKETO_CLIENT_ID`
     - `MARKETO_CLIENT_SECRET`
     - `MARKETO_ENDPOINT`
     - `ALFRESCO_URL`
     - `ALFRESCO_USERNAME`
     - `ALFRESCO_PASSWORD`
     - `ALFRESCO_BASE_PATH`

2. (Optional) Add variables for configuration:
   - `SYNC_LOOKBACK_DAYS` (default: 90)
   - `SYNC_BATCH_SIZE` (default: 50)

3. The workflow will run automatically:
   - **Scheduled**: Daily at 2 AM UTC
   - **Manual**: Via workflow_dispatch in GitHub Actions UI

### Manual Trigger

To manually trigger the sync in GitHub Actions:
1. Go to **Actions** tab in your repository
2. Select **Marketo to Alfresco Sync** workflow
3. Click **Run workflow**
4. Optionally select a log level (DEBUG, INFO, WARN, ERROR)

## Project Structure

```
mkto-fresco/
├── .github/
│   └── workflows/
│       └── sync.yml               # GitHub Actions workflow
├── src/
│   ├── marketo/
│   │   ├── client.ts              # Marketo API client
│   │   ├── client.test.ts         # Marketo client tests
│   │   └── types.ts               # Marketo TypeScript types
│   ├── alfresco/
│   │   ├── client.ts              # Alfresco API client
│   │   ├── client.test.ts         # Alfresco client tests
│   │   └── types.ts               # Alfresco TypeScript types
│   ├── utils/
│   │   ├── date.ts                # Date utilities
│   │   ├── date.test.ts           # Date utilities tests
│   │   ├── logger.ts              # Logging utilities
│   │   ├── logger.test.ts         # Logger tests
│   │   ├── retry.ts               # Retry logic with backoff
│   │   └── retry.test.ts          # Retry logic tests
│   ├── config.ts                  # Configuration management
│   ├── config.test.ts             # Config tests
│   ├── sync.ts                    # Main sync orchestration
│   └── sync.test.ts               # Sync orchestration tests
├── package.json
├── tsconfig.json
├── jest.config.js                 # Jest test configuration
├── .eslintrc.js                   # ESLint configuration
├── .env.example
└── README.md
```

## How It Works

### Sync Process

1. **Authentication**
   - Authenticate with Marketo using OAuth2
   - Authenticate with Alfresco using Basic Auth

2. **Load Sync State**
   - Retrieve last sync timestamp from Alfresco metadata
   - If no previous sync, look back configured number of days (default: 90)

3. **Fetch Emails**
   - Query Marketo for emails modified since last sync
   - Retrieve email content (HTML) and metadata

4. **Process & Upload**
   - For each email:
     - Create folder structure in Alfresco: `/{YYYY}/{MM}/{campaign-name}/`
     - Check if email already exists (skip if duplicate)
     - Upload HTML content with metadata properties
     - Upload JSON metadata file

5. **Save Sync State**
   - Update last sync timestamp in Alfresco

6. **Report Results**
   - Log summary (total, processed, skipped, failed)
   - Exit with error code if any failures

### Folder Structure in Alfresco

```
/Company Home/Marketo Emails/
├── 2024/
│   ├── 01/
│   │   ├── Product Launch Campaign/
│   │   │   ├── 12345-email-name.html
│   │   │   └── 12345-email-name-metadata.json
│   │   └── Newsletter/
│   │       ├── 12346-newsletter-jan.html
│   │       └── 12346-newsletter-jan-metadata.json
│   └── 02/
│       └── ...
└── .sync-state.json           # Tracks last sync timestamp
```

### Metadata Properties

Each email in Alfresco includes custom properties:
- `mkto:emailId` - Marketo email ID
- `mkto:emailName` - Email name
- `mkto:campaignName` - Campaign/folder name
- `mkto:subject` - Email subject line
- `mkto:fromName` - From name
- `mkto:fromEmail` - From email address
- `mkto:createdAt` - When email was created in Marketo
- `mkto:updatedAt` - When email was last updated in Marketo
- `mkto:lastSyncedAt` - When email was synced to Alfresco

## Error Handling

The sync script includes comprehensive error handling:

- **Retry Logic**: Automatically retries failed API calls up to 3 times with exponential backoff
- **Graceful Degradation**: Continues processing other emails if one fails
- **Failed Email Tracking**: Maintains a list of failed email IDs
- **Rate Limiting**: Respects API rate limits with appropriate delays
- **Logging**: Detailed logs for debugging and monitoring

### Exit Codes

- `0` - Success
- `1` - Partial or complete failure (check logs for details)

## Testing

Run the test suite:
```bash
pnpm test
```

Type check without emitting files:
```bash
pnpm run type-check
```

Lint the code:
```bash
pnpm run lint
```

## Monitoring

### GitHub Actions Workflow

The workflow provides:
- **Summary**: Displays sync results in workflow summary
- **Artifacts**: Uploads list of failed emails (if any)
- **Notifications**: Optional Slack/email notifications on failure (configure in workflow)

### Logs

Logs are written to stdout with the following levels:
- `DEBUG` - Detailed debugging information
- `INFO` - General informational messages (default)
- `WARN` - Warning messages
- `ERROR` - Error messages

Set `LOG_LEVEL` environment variable to control verbosity.

## Troubleshooting

### Common Issues

**Authentication Failed**
- Verify Marketo Client ID and Client Secret
- Check that your Marketo endpoint URL is correct
- Ensure Alfresco credentials have proper permissions

**Rate Limiting**
- Reduce `SYNC_BATCH_SIZE` to process fewer emails at once
- Marketo has a limit of 50,000 API calls per day

**Missing Emails**
- Check `SYNC_LOOKBACK_DAYS` configuration
- Verify the last sync timestamp in `.sync-state.json`

**Folder Creation Errors**
- Ensure `ALFRESCO_BASE_PATH` exists in Alfresco
- Verify user has permissions to create folders

## Security Considerations

- **Never commit `.env` file** - It contains sensitive credentials
- **Use GitHub Secrets** - Store all credentials as encrypted secrets
- **Rotate credentials regularly** - Update API keys periodically
- **Limit permissions** - Use service accounts with minimal required permissions
- **Enable audit logging** - Track API access in both Marketo and Alfresco

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review GitHub Actions workflow logs
3. Open an issue in this repository

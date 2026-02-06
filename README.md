# Mail Collector Service

A scalable email collection service that connects multiple Outlook/Microsoft 365 mailboxes via OAuth and forwards all emails to a single consolidated inbox.

## 🎯 Features

- **OAuth Authentication** - Secure Microsoft OAuth 2.0 login (no passwords stored)
- **Delta Sync** - Efficient email retrieval using Microsoft Graph delta queries
- **Auto Forwarding** - Forwards emails to your consolidated inbox via SMTP
- **Dashboard** - Modern React dashboard for managing accounts
- **Background Workers** - Queue-based processing with Bull/Redis
- **Retry Logic** - Automatic retries with exponential backoff
- **Logging** - Comprehensive logging and audit trail

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  React Dashboard │────▶│  Express API     │────▶│  MySQL Database │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Microsoft Graph │◀────│  Worker Service  │◀────│  Redis Queue    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │  SMTP Forwarder  │────▶ fwd@dmstoresa2.pro
                        └──────────────────┘
```

## 📋 Prerequisites

1. **Node.js** v18 or higher
2. **MySQL** 8.0 or higher
3. **Redis** 6.0 or higher
4. **Microsoft Azure Account** (for OAuth app registration)

## 🚀 Quick Start

### 1. Clone and Install

```bash
cd mail
npm install
cd client && npm install && cd ..
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your settings
```

### 3. Setup Database

```bash
npm run db:push
```

### 4. Start Services

```bash
# Terminal 1 - API Server
npm run dev

# Terminal 2 - Worker
npm run dev:worker

# Terminal 3 - Frontend (development)
cd client && npm start
```

## ⚙️ Configuration Guide

### Environment Variables

| Variable                  | Description                 | Example                                           |
| ------------------------- | --------------------------- | ------------------------------------------------- |
| `DATABASE_URL`            | MySQL connection string     | `mysql://root:pass@localhost:3306/mail_collector` |
| `REDIS_HOST`              | Redis server host           | `localhost`                                       |
| `MICROSOFT_CLIENT_ID`     | Azure App Client ID         | `abc123-...`                                      |
| `MICROSOFT_CLIENT_SECRET` | Azure App Secret            | `secret123`                                       |
| `FORWARD_TO_EMAIL`        | Target inbox for forwarding | `fwd@dmstoresa2.pro`                              |
| `SMTP_HOST`               | SMTP server for sending     | `smtp.dmstoresa2.pro`                             |

See `.env.example` for all options.

## 🔐 Azure App Registration (Step by Step)

### Step 1: Go to Azure Portal

1. Visit [Azure Portal](https://portal.azure.com)
2. Navigate to **Microsoft Entra ID** (formerly Azure AD)
3. Click **App registrations** → **New registration**

### Step 2: Register Application

- **Name**: `Mail Collector Service`
- **Supported account types**: Select "Accounts in any organizational directory and personal Microsoft accounts"
- **Redirect URI**:
  - Type: `Web`
  - URL: `http://localhost:5000/api/auth/microsoft/callback`

Click **Register**

### Step 3: Configure API Permissions

1. Go to **API permissions**
2. Click **Add a permission** → **Microsoft Graph** → **Delegated permissions**
3. Add these permissions:
   - `Mail.Read` - Read user mail
   - `User.Read` - Sign in and read user profile
   - `offline_access` - Maintain access (for refresh tokens)
4. Click **Grant admin consent** (if you're admin)

### Step 4: Create Client Secret

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Description: `Mail Collector Secret`
4. Expires: Choose appropriate duration
5. **Copy the Value immediately** (you won't see it again!)

### Step 5: Get Application IDs

From the **Overview** page, copy:

- **Application (client) ID** → `MICROSOFT_CLIENT_ID`
- **Directory (tenant) ID** → (optional, for single-tenant)

### Step 6: Update .env

```env
MICROSOFT_CLIENT_ID=your-application-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret-value
MICROSOFT_REDIRECT_URI=http://localhost:5000/api/auth/microsoft/callback
```

## 📧 SMTP Configuration

Configure your SMTP server for forwarding emails:

```env
SMTP_HOST=smtp.dmstoresa2.pro
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=forwarder@dmstoresa2.pro
SMTP_PASS=your-smtp-password
SMTP_FROM=Mail Collector <forwarder@dmstoresa2.pro>
FORWARD_TO_EMAIL=fwd@dmstoresa2.pro
```

## 🖥️ Dashboard Usage

### Login

Default admin credentials (change in production!):

- Email: `admin@dmstoresa2.pro`
- Password: `change-this-password`

### Adding Accounts

1. Click **Add Account**
2. Enter the Outlook email address
3. Click **Add & Connect**
4. A popup opens for the mailbox owner to sign in
5. After consent, the account appears as "Connected"

### Account States

| Status           | Meaning                           |
| ---------------- | --------------------------------- |
| 🟢 Connected     | Actively syncing                  |
| 🟡 Needs Re-auth | Token expired, needs reconnection |
| 🔴 Error         | Multiple failures, check logs     |
| 🔵 Pending       | Awaiting OAuth completion         |
| ⚫ Disabled      | Manually paused                   |

### Manual Actions

- **Sync Now** - Trigger immediate sync for an account
- **Reconnect** - Generate new OAuth link
- **Test Connection** - Verify account access
- **Sync All** - Sync all connected accounts at once

## 🔄 How Syncing Works

1. **Delta Query**: The worker calls Microsoft Graph's delta endpoint to get only new/changed messages
2. **Message Fetch**: For each new message, it fetches full content including attachments
3. **Forward**: The message is sent via SMTP to your consolidated inbox
4. **Logging**: All operations are logged for debugging

### Sync Interval

Default: Every **2 minutes** per account. Adjust with:

```env
POLL_INTERVAL_MS=120000  # 2 minutes in milliseconds
```

## 🛠️ Production Deployment

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start API server
pm2 start src/server.js --name mail-api

# Start worker
pm2 start src/worker.js --name mail-worker

# Save PM2 config
pm2 save

# Enable startup on boot
pm2 startup
```

### Build Frontend

```bash
cd client
npm run build
```

The built files are served automatically by the Express server in production mode.

### Nginx Reverse Proxy (Optional)

```nginx
server {
    listen 80;
    server_name mail.dmstoresa2.pro;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Production Redirect URI

Update in Azure Portal and `.env`:

```env
MICROSOFT_REDIRECT_URI=https://mail.dmstoresa2.pro/api/auth/microsoft/callback
```

## 📊 Database Schema

```
mail_accounts       - Connected mailbox accounts
mail_tokens         - Encrypted OAuth tokens
mail_sync_state     - Delta sync cursors
mail_message_log    - Forwarding history
system_logs         - Audit trail
admin_users         - Dashboard users
```

## 🔍 Troubleshooting

### "Needs Re-auth" Status

The refresh token expired or was revoked:

1. Click **Reconnect** on the account
2. Have the mailbox owner complete OAuth again

### Messages Not Forwarding

1. Check SMTP settings in `.env`
2. Verify SMTP credentials
3. Check `system_logs` for error details
4. Try **Retry Failed** button

### Rate Limiting (429 Errors)

Microsoft Graph has rate limits. The service handles this automatically with backoff, but if persistent:

- Reduce `WORKER_CONCURRENCY`
- Increase `POLL_INTERVAL_MS`

### Worker Not Processing

1. Ensure Redis is running: `redis-cli ping`
2. Check worker logs for errors
3. Restart worker: `pm2 restart mail-worker`

## 🔒 Security Checklist

- [ ] Change default admin password
- [ ] Set strong `JWT_SECRET`
- [ ] Set unique `ENCRYPTION_KEY`
- [ ] Use HTTPS in production
- [ ] Restrict database access
- [ ] Regular token rotation
- [ ] Monitor failed login attempts

## 📝 API Endpoints

### Authentication

- `POST /api/auth/login` - Admin login
- `GET /api/auth/microsoft/connect` - Get OAuth URL
- `GET /api/auth/microsoft/callback` - OAuth callback

### Accounts

- `GET /api/accounts` - List all accounts
- `POST /api/accounts` - Add new account
- `POST /api/accounts/:id/sync` - Trigger sync
- `POST /api/accounts/:id/reconnect` - Get reconnect URL
- `DELETE /api/accounts/:id` - Remove account

### Dashboard

- `GET /api/dashboard/stats` - Get statistics
- `POST /api/dashboard/sync-all` - Sync all accounts
- `POST /api/dashboard/retry-failed` - Retry failed messages

### Logs

- `GET /api/logs` - System logs
- `GET /api/logs/messages` - Message forwarding logs

## 🤝 Support

For issues or questions, check the logs first:

1. API logs: `logs/app.log`
2. Error logs: `logs/error.log`
3. Dashboard: Logs page

## 📄 License

MIT License - Use freely for your projects.

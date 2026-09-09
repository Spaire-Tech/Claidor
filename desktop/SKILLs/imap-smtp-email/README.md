# IMAP/SMTP Email Skill

Read and send email via IMAP/SMTP protocol. Works with any IMAP/SMTP server including Gmail and Outlook / Microsoft 365.

## Quick Setup

1. **Configure accounts in Swen Settings > Email.**

Swen writes `accounts.json` for multi-account setups. Existing `.env` files are still read as a legacy single-account fallback.

Optional legacy `.env` format:

```bash
# IMAP Configuration (receiving email)
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=your@gmail.com
IMAP_PASS=your_app_password
IMAP_TLS=true
IMAP_MAILBOX=INBOX

# SMTP Configuration (sending email)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=your@gmail.com
```

2. **Install dependencies:**
```bash
npm install
```

3. **Test the connection:**
```bash
node scripts/imap.js check
node scripts/smtp.js test
```

## Account Selection

```bash
# Use the default enabled account
node scripts/imap.js check

# List account IDs without secrets
node scripts/imap.js accounts
node scripts/smtp.js accounts

# Use a specific account
node scripts/imap.js check --account work

# Fan out to every enabled account for read/list commands
node scripts/imap.js check --all-accounts
node scripts/imap.js search --all-accounts --unseen
node scripts/imap.js list-mailboxes --all-accounts
```

## IMAP Commands (Receiving Email)

### Check for new emails
```bash
node scripts/imap.js check --limit 10
node scripts/imap.js check --account work --limit 10
node scripts/imap.js check --all-accounts --limit 10
node scripts/imap.js check --recent 2h        # Last 2 hours
node scripts/imap.js check --recent 30m       # Last 30 minutes
```

### Fetch specific email
```bash
node scripts/imap.js fetch <uid>
node scripts/imap.js fetch <uid> --account work
```

### Search emails
```bash
node scripts/imap.js search --unseen
node scripts/imap.js search --all-accounts --unseen
node scripts/imap.js search --from "sender@example.com"
node scripts/imap.js search --subject "important"
node scripts/imap.js search --recent 24h
```

### Mark as read/unread
```bash
node scripts/imap.js mark-read <uid>
node scripts/imap.js mark-unread <uid> --account work
```

### List mailboxes
```bash
node scripts/imap.js list-mailboxes
node scripts/imap.js list-mailboxes --all-accounts
```

## SMTP Commands (Sending Email)

### Test SMTP connection
```bash
node scripts/smtp.js test
node scripts/smtp.js test --account work
```

### Send email
```bash
# Simple text email
node scripts/smtp.js send --to recipient@example.com --subject "Hello" --body "World" --confirmed

# HTML email
node scripts/smtp.js send --to recipient@example.com --subject "Newsletter" --html --body "<h1>Welcome</h1>" --confirmed

# Email with attachment
node scripts/smtp.js send --to recipient@example.com --subject "Report" --body "Please find attached" --attach report.pdf --confirmed

# Multiple recipients
node scripts/smtp.js send --account work --to "a@example.com,b@example.com" --cc "c@example.com" --subject "Update" --body "Team update" --confirmed
```

Sending is blocked unless `--confirmed` is passed after the user confirms recipient, subject, sender account, and body.

## Common Email Servers

| Provider | IMAP Host | IMAP Port | SMTP Host | SMTP Port |
|----------|-----------|-----------|-----------|-----------|
| Gmail | imap.gmail.com | 993 | smtp.gmail.com | 587 (STARTTLS) or 465 (SSL) |
| Outlook / Microsoft 365 | outlook.office365.com | 993 | smtp.office365.com | 587 |

**Important for Gmail:**
- Use an **App Password** (requires 2-Step Verification), not the account password
- Enable IMAP in Gmail settings first

**Important for Outlook / Microsoft 365:**
- Use an app password if the account has multi-factor authentication enabled

## Configuration Options

**IMAP:**
- `IMAP_HOST` - Server hostname
- `IMAP_PORT` - Server port
- `IMAP_USER` - Your email address
- `IMAP_PASS` - Your password or app-specific password
- `IMAP_TLS` - Use TLS (true for SSL, false for STARTTLS)
- `IMAP_REJECT_UNAUTHORIZED` - Accept self-signed certs
- `IMAP_MAILBOX` - Default mailbox (INBOX)

**SMTP:**
- `SMTP_HOST` - Server hostname
- `SMTP_PORT` - Server port (587 for STARTTLS, 465 for SSL)
- `SMTP_SECURE` - true for SSL (465), false for STARTTLS (587)
- `SMTP_USER` - Your email address
- `SMTP_PASS` - Your password or app-specific password
- `SMTP_FROM` - Default sender email (optional)
- `SMTP_REJECT_UNAUTHORIZED` - Accept self-signed certs
- `EMAIL_REQUIRE_SEND_CONFIRMATION` - Set to `false` only for trusted automation that may send without `--confirmed`

## Troubleshooting

**Connection errors:**
- Verify IMAP/SMTP server is running and accessible
- Check host/port settings in `.env`

**Authentication failed:**
- For Gmail: Use an App Password (not the account password) if 2-Step Verification is enabled
- For Outlook / Microsoft 365: Use an app password if MFA is enabled

**TLS/SSL errors:**
- For self-signed certs: Set `IMAP_REJECT_UNAUTHORIZED=false` or `SMTP_REJECT_UNAUTHORIZED=false`

## Files

- `SKILL.md` - Skill documentation
- `accounts.json` - Multi-account credentials managed by Swen Settings
- `scripts/imap.js` - IMAP CLI tool
- `scripts/smtp.js` - SMTP CLI tool
- `package.json` - Node.js dependencies
- `.env` - Legacy single-account credentials fallback

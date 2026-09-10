# SQLite Backup Performance Test

This directory contains utilities and notes for SQLite backup and recovery performance testing.

## Files

- `generate-large-db.cjs`: Bulk-loads large synthetic data into an existing database.

## Test Goals

- Build a large enough local database and observe automatic backup duration and logs.
- Validate both the normal startup check path and the forced-backup-on-every-startup path.
- Validate recovery behavior when the backup file is missing or the database is corrupted.

## Prerequisites

1. Confirm that `sqlite3` is available in your shell.

   ```bash
   which sqlite3
   sqlite3 -version
   ```

2. Confirm the target database path. The default desktop user-data path is usually:

   ```bash
   ~/Library/Application\ Support/Maties/maties.sqlite
   ```

3. It is recommended to close the app before seeding data, to avoid lock contention with a running process.

## 1. Generate a Large Database

First, generate enough data for backup performance testing.

### Example: medium-sized dataset

```bash
npm run test:sqlite-backup:seed -- \
  --db "$HOME/Library/Application Support/Maties/maties.sqlite" \
  --sessions 10 \
  --messages-per-session 2000 \
  --payload-kb 8
```

### Example: larger dataset

```bash
npm run test:sqlite-backup:seed -- \
  --db "$HOME/Library/Application Support/Maties/maties.sqlite" \
  --sessions 50 \
  --messages-per-session 10000 \
  --payload-kb 16
```

### Notes

- The script appends data into `cowork_sessions` and `cowork_messages`; it does not wipe existing data.
- A larger `payload-kb` makes each message larger and grows the backup payload faster.
- After completion, the script prints the main DB size and WAL size.

## 2. Enable Auto Backup in the App

Open the app settings and enable "Auto Backup and Recovery".

This is required before the automatic backup logic will run.

## 3. Force Backup on Every Startup for QA

If QA needs an automatic backup on every startup, set this environment variable:

```bash
MATIES_SQLITE_BACKUP_ALWAYS_ON_STARTUP=1
```

Supported truthy values: `1`, `true`.

### Example: run in dev mode with forced startup backup

```bash
MATIES_SQLITE_BACKUP_ALWAYS_ON_STARTUP=1 npm run electron:dev
```

### What this does

- On startup, it bypasses the normal "has it been 3 days?" interval check and forces a backup.
- This variable only changes automatic backup timing; it does not change recovery behavior.

## 4. Observe Backup Logs

After the app starts, inspect the main-process logs.

Focus on these log lines:

- `[SqliteBackup] Forced startup backup is enabled ...`
- `[SqliteBackup] Starting periodic backup to maties-latest.sqlite`
- `[SqliteBackup] Backup progress: transferred X/Y pages, Z remaining`
- `[SqliteBackup] Completed periodic backup with 1 retained snapshot(s)`

Without the force env var, startup will first check:

- whether the backup file exists
- whether more than 3 days have passed since the last successful backup

## 5. Verify Backup Artifact

After backup completes, verify that the backup file exists:

```bash
ls -lh ~/Library/Application\ Support/Maties/backups/sqlite/snapshots/
```

The current single backup file is:

```text
maties-latest.sqlite
```

## 6. Recovery Test

### Option A: backup file missing

Delete the backup file, then restart the app.

Expected behavior:

- startup check notices the backup file is missing
- an automatic replacement backup is triggered

### Option B: corrupt the main database

Make sure a valid backup exists first, then intentionally corrupt the main database.

Example:

```bash
printf 'not-a-sqlite-db' > ~/Library/Application\ Support/Maties/maties.sqlite
```

Then launch the app.

Expected behavior:

- opening the main DB fails
- the app attempts to restore from the latest backup
- startup continues after successful restore

## 7. Suggested QA Flow

Suggested QA sequence:

1. Close the app.
2. Run the seeding script to build a large database.
3. Enable auto backup and recovery in the app.
4. Launch the app with `MATIES_SQLITE_BACKUP_ALWAYS_ON_STARTUP=1`.
5. Record backup start, progress, completion logs, and duration.
6. Delete the backup file, restart, and confirm a replacement backup is created immediately.
7. Corrupt the main DB and restart to confirm recovery works.

## Safety Notes

- Do not run destructive recovery tests against important real user data.
- It is recommended to copy the user-data directory before running aggressive tests.

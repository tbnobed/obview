# Large File Upload Fix

This document explains how to fix issues with large file uploads that result in database errors.

## Problem Description

When uploading files larger than approximately 2GB, the application may encounter a database error:

```
error: value "4112690763" is out of range for type integer
```

This happens because PostgreSQL's `integer` type has a maximum value of 2,147,483,647 (about 2GB), and large file sizes exceed this limit.

## Solution

We've updated the database schema to use `bigint` instead of `integer` for the `file_size` column in the `files` table. This change allows file sizes up to approximately 9 exabytes.

### Steps to Apply the Fix

1. **Apply Schema Changes**: The code repository includes an updated schema and a migration file. The migration needs to be applied to your database.

2. **Run the Database Migration**: Follow these steps to apply the migration:

   ```bash
   # Option 1: If you're using the Docker setup
   docker-compose exec obview-app sh -c "NODE_ENV=production node /app/dist/server/db-migrate.js"

   # Option 2: For manual execution
   cd /path/to/obviu
   NODE_ENV=production node server/db-migrate.js
   ```

3. **Restart the Application**: After applying the migration, restart the application:

   ```bash
   docker-compose restart obview-app
   ```

4. **Verify the Fix**: Upload a large file to confirm the issue is resolved. You should be able to upload files larger than 2GB without database errors.

## Technical Details

The following changes were made:

1. Added a new migration file: `migrations/0004_update_file_size_type.sql` that alters the `file_size` column to use `BIGINT`
2. Updated the schema definition in `shared/schema.ts` to use `bigint` type instead of `integer` for the `fileSize` field

The bigint type in PostgreSQL can handle values up to 9,223,372,036,854,775,807, which is far more than any practical file size.

## Potential Side Effects

This change should be completely backward compatible with existing data. All existing integer values will be seamlessly converted to bigint values. No data migration is needed beyond running the SQL migration.
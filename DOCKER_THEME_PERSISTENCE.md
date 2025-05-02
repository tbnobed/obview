# Docker Theme Persistence

This document explains the implementation of theme persistence in Docker environments for Obviu.io.

## Overview

When deploying the application in Docker, certain considerations must be made to ensure user theme preferences persist properly across container restarts and upgrades.

## Implementation Details

### 1. SQL Migration Improvements

We've enhanced our migration script to only set default values for NULL entries, preserving existing user preferences:

```sql
-- Add theme_preference column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_preference TEXT DEFAULT 'system';

-- Only update NULL values to 'system', preserving existing preferences
UPDATE users SET theme_preference = 'system' WHERE theme_preference IS NULL;
```

### 2. Docker Entrypoint Script Enhancement

The Docker entrypoint script has been updated to directly apply SQL migrations from the `migrations` directory, ensuring theme preference migrations are applied even if the main JavaScript migration system fails:

```sh
# Apply any SQL migrations directly if they exist
if [ -d "/app/migrations" ]; then
  echo "Found SQL migrations directory, applying SQL migrations..."
  for migration in /app/migrations/*.sql; do
    if [ -f "$migration" ]; then
      echo "Applying SQL migration: $migration"
      # Execute the SQL file against the database
      # Parsing DATABASE_URL to extract credentials
      DB_HOST=$(echo $DATABASE_URL | sed -E 's/.*@([^:]+)(:[0-9]+)?\/.*/\1/')
      DB_PORT=$(echo $DATABASE_URL | sed -E 's/.*:([0-9]+)\/.*/\1/')
      DB_NAME=$(echo $DATABASE_URL | sed -E 's/.*\/([^?]+).*/\1/')
      DB_USER=$(echo $DATABASE_URL | sed -E 's/.*:\/\/([^:]+):.*/\1/')
      DB_PASS=$(echo $DATABASE_URL | sed -E 's/.*:\/\/[^:]+:([^@]+).*/\1/')
      
      # Execute the SQL file using psql
      PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f $migration || {
        echo "Warning: SQL migration $migration encountered issues."
        echo "This might be normal if the changes already exist. Continuing..."
      }
    fi
  done
fi
```

### 3. Defensive Theme Handling in Frontend

The theme provider has been enhanced with defensive coding to handle Docker restarts and upgrades:

```javascript
// Set a default theme if the user doesn't have a theme preference
const userTheme = user.themePreference || 'system';

// If user has a preference in their profile, use that (overrides localStorage)
if (['light', 'dark', 'system'].includes(userTheme)) {
  setThemeState(userTheme as Theme);
  // Also update localStorage to keep them in sync
  localStorage.setItem(storageKey, userTheme);
} else {
  // If the user has an invalid theme preference, use the default
  setThemeState(defaultTheme);
  // Update localStorage
  localStorage.setItem(storageKey, defaultTheme);
  // Attempt to fix the user's preference
  if (user) {
    updateThemeMutation.mutate(defaultTheme);
  }
}
```

### 4. Default Theme in User Registration

We've updated the registration endpoint to explicitly set a default theme, ensuring new users always have a valid preference:

```javascript
const user = await storage.createUser({
  // other fields...
  themePreference: "system", // Default theme preference
});
```

## Testing in Docker

When deploying a new Docker container:

1. The migration script will add the theme_preference column if it doesn't exist
2. Only NULL theme preferences will be updated to 'system', preserving existing preferences
3. The frontend will gracefully handle any edge cases

Even if a container restart happens, user theme preferences will be maintained from the database, ensuring a consistent experience.

## Recommended Docker Settings

For optimal theme persistence:

1. Use a persistent volume for the PostgreSQL database
2. Ensure the PGDATA directory is mounted to the host when using the official PostgreSQL image
3. Keep the migrations directory in your Docker image to ensure SQL migrations are available
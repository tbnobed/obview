# Disabling Registration in Docker Deployments

This document explains how to disable user registration in Docker deployments of Obviu.io.

## Overview

The `VITE_DISABLE_REGISTRATION` environment variable allows you to disable the registration option on the authentication page, making the application login-only.

## Usage

### For Docker Deployments

Since Vite environment variables are embedded at build time, you need to set the variable **before** building the Docker image:

#### Method 1: Environment Variable + Docker Compose

1. Set the environment variable in your `.env` file:
   ```bash
   VITE_DISABLE_REGISTRATION=true
   ```

2. Rebuild the Docker containers:
   ```bash
   docker-compose down
   docker-compose up --build
   ```

#### Method 2: Inline Environment Variable

```bash
VITE_DISABLE_REGISTRATION=true docker-compose up --build
```

#### Method 3: Docker Build Command

If building manually:
```bash
docker build --build-arg VITE_DISABLE_REGISTRATION=true -t obviu .
```

### For Development Mode

Simply set the environment variable in your `.env` file:
```bash
VITE_DISABLE_REGISTRATION=true
```

Then restart your development server:
```bash
npm run dev
```

## Behavior

When `VITE_DISABLE_REGISTRATION=true`:
- The "Register" tab is hidden from the authentication page
- The "Create account" link in the login form is hidden
- The tab list adjusts to show only the login option
- Existing users can still log in normally

When `VITE_DISABLE_REGISTRATION=false` (default):
- Both login and registration options are available
- Users can create new accounts
- Normal registration workflow is active

## Important Notes

- **Docker Builds**: The environment variable must be available during the Docker build process, not just at runtime
- **Rebuilding Required**: Changes to this setting require rebuilding the Docker image
- **Admin Access**: Make sure you have admin access before disabling registration, as you won't be able to create new accounts through the UI
- **Manual User Creation**: With registration disabled, new users must be created through database operations or admin tools

## Troubleshooting

If registration is still showing after setting the environment variable:

1. **Verify the build argument**: Check that the Docker build shows the correct environment variable value in the build logs
2. **Clear cache**: Run `docker-compose build --no-cache` to ensure a fresh build
3. **Check environment**: Ensure the variable is set before running `docker-compose up --build`

Example build log output should show:
```
VITE_DISABLE_REGISTRATION=true
```

If you see `VITE_DISABLE_REGISTRATION=false` or the variable is undefined, the build argument wasn't passed correctly.
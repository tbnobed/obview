/**
 * URL utilities to help ensure consistent URL generation across different environments
 */

/**
 * Gets the base URL for the current application environment
 * This will work across development, Replit, and production environments
 */
export function getBaseUrl(): string {
  // Check if we're in a browser environment
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  
  // Fallback for SSR or other non-browser environments
  return 'http://localhost:5000';
}

/**
 * Generates a project share URL
 */
export function getProjectShareUrl(projectId: number | string): string {
  return `${getBaseUrl()}/projects/${projectId}`;
}

/**
 * Generates an invite URL from a token
 */
export function getInviteUrl(token: string): string {
  return `${getBaseUrl()}/invite/${token}`;
}

/**
 * Generates a file share URL from a token
 */
export function getFileShareUrl(token: string): string {
  return `${getBaseUrl()}/public/share/${token}`;
}
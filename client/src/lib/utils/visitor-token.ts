/**
 * Utility for managing anonymous visitor tokens for public reactions and interactions.
 * Each visitor gets a unique token stored in localStorage for consistent identity
 * across reactions on public shared pages.
 */

const VISITOR_TOKEN_KEY = 'public-visitor-token';

/**
 * Generate a random visitor token
 */
function generateVisitorToken(): string {
  // Generate a random UUID-like string for visitor identification
  return 'visitor_' + Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15) + 
         '_' + Date.now().toString(36);
}

/**
 * Get or create a visitor token for anonymous interactions
 */
export function getVisitorToken(): string {
  try {
    let token = localStorage.getItem(VISITOR_TOKEN_KEY);
    if (!token) {
      token = generateVisitorToken();
      localStorage.setItem(VISITOR_TOKEN_KEY, token);
    }
    return token;
  } catch (error) {
    console.warn('Failed to access localStorage for visitor token:', error);
    // Fallback to session-based token (won't persist across page reloads)
    return generateVisitorToken();
  }
}

/**
 * Clear the visitor token (useful for testing or privacy)
 */
export function clearVisitorToken(): void {
  try {
    localStorage.removeItem(VISITOR_TOKEN_KEY);
  } catch (error) {
    console.warn('Failed to clear visitor token:', error);
  }
}
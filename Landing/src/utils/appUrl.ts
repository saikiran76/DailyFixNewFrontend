"use client";

/**
 * Utility function to get the main application URL based on current environment
 * 
 * @returns The appropriate URL for the main application
 */
export function getAppUrl(): string {
  // Check if window is defined (client-side)
  if (typeof window === 'undefined') {
    // Server-side rendering - return prod URL by default
    // This URL will be replaced with the correct one on the client
    return "https://daily-fix-new-frontend.vercel.app";
  }

  // Client-side - check if we're in production by looking at the hostname
  const isProd = window.location.hostname.includes('vercel.app') || 
                !window.location.hostname.includes('localhost');
  
  // Return the appropriate URL
  return isProd 
    ? "https://daily-fix-new-frontend.vercel.app" 
    : "http://localhost:5173";
}

/**
 * Navigates to the main application with optional path and query parameters
 * 
 * @param path - The path to navigate to (e.g., '/login', '/signup')
 * @param params - Object containing query parameters
 */
export function navigateToApp(path: string = "", params: Record<string, string> = {}): void {
  // Check if window is defined (client-side)
  if (typeof window === 'undefined') {
    console.warn('navigateToApp was called on the server side, navigation will not occur');
    return;
  }

  const baseUrl = getAppUrl();
  
  // Build query string if parameters exist
  let queryString = '';
  const entries = Object.entries(params);
  
  if (entries.length > 0) {
    queryString = '?' + entries
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
  }
  
  // Navigate to the URL
  window.location.href = `${baseUrl}${path}${queryString}`;
} 
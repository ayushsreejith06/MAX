/**
 * Desktop environment detection and configuration utilities
 */

/**
 * Check if the app is running in Tauri desktop mode
 */
export function isDesktopApp(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  
  // Check for Tauri global object
  return typeof (window as any).__TAURI__ !== 'undefined';
}

/**
 * Get the backend base URL based on the environment
 * In desktop mode, uses localhost with the desktop port
 * In web mode, uses the configured NEXT_PUBLIC_MAX_BACKEND_URL or default
 */
export function getBackendBaseUrl(): string {
  if (isDesktopApp()) {
    // Desktop mode: always use localhost with desktop port
    return 'http://127.0.0.1:4000';
  }
  
  // Web mode: use environment variable or default
  return process.env.NEXT_PUBLIC_MAX_BACKEND_URL || 
         process.env.NEXT_PUBLIC_BACKEND_URL || 
         'http://localhost:8000';
}

/**
 * Get the API base URL (backend URL + /api prefix)
 */
export function getApiBaseUrl(): string {
  const backendUrl = getBackendBaseUrl();
  return `${backendUrl.replace(/\/$/, '')}/api`;
}


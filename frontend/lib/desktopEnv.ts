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
 * In desktop mode, uses localhost with the desktop port (ALWAYS takes precedence)
 * In web mode, uses the configured NEXT_PUBLIC_MAX_BACKEND_URL or default
 */
export function getBackendBaseUrl(): string {
  // ALWAYS check for desktop mode first - it takes precedence over env vars
  if (typeof window !== 'undefined') {
    // Check multiple ways to detect Tauri
    const hasTauri = typeof (window as any).__TAURI__ !== 'undefined';
    const hasTauriInternals = typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';
    const userAgent = window.navigator?.userAgent || '';
    const hasTauriInUA = userAgent.includes('Tauri');
    
    // Also check if we're running in a Tauri window by checking the protocol
    // Tauri uses a custom protocol (tauri://localhost) or file://
    const isTauriProtocol = window.location.protocol === 'tauri:' || 
                           window.location.protocol === 'file:';
    
    const isTauri = hasTauri || hasTauriInternals || hasTauriInUA || isTauriProtocol;
    
    if (isTauri) {
      // Desktop mode: always use localhost with desktop port
      return 'http://127.0.0.1:4000';
    }
  }
  
  // Web mode: use environment variable or default
  const envUrl = process.env.NEXT_PUBLIC_MAX_BACKEND_URL || 
                 process.env.NEXT_PUBLIC_BACKEND_URL;
  
  if (envUrl) {
    return envUrl;
  }
  
  // Default for web mode
  return 'http://localhost:8000';
}

/**
 * Get the API base URL (backend URL + /api prefix)
 */
export function getApiBaseUrl(): string {
  const backendUrl = getBackendBaseUrl();
  return `${backendUrl.replace(/\/$/, '')}/api`;
}


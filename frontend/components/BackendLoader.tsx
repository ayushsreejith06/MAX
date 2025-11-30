'use client';

import { useEffect, useState } from 'react';
import { isDesktopApp } from '@/lib/desktopEnv';

export function BackendLoader({ children }: { children: React.ReactNode }) {
  // Use mounted state to prevent hydration mismatch
  // Start with false, then set to true after mount (client-side only)
  const [mounted, setMounted] = useState(false);
  const [backendReady, setBackendReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  // Set mounted state after component mounts (client-side only)
  useEffect(() => {
    setMounted(true);
    // If not in desktop mode, backend is immediately ready
    if (!isDesktopApp()) {
      setBackendReady(true);
    }
  }, []);

  useEffect(() => {
    // Only run after component is mounted and we're in desktop mode
    if (!mounted || !isDesktopApp() || backendReady) return;

    const maxAttempts = 60; // 30 seconds total (500ms * 60)
    let attemptCount = 0;
    let cancelled = false;

    const checkBackend = async () => {
      if (cancelled) return;

      try {
        const response = await fetch('http://127.0.0.1:4000/health', {
          method: 'GET',
          cache: 'no-store',
          signal: AbortSignal.timeout(1000), // 1 second timeout
        });

        if (response.ok) {
          setBackendReady(true);
          setError(null);
          return;
        }
      } catch (err) {
        // Backend not ready yet, continue checking
      }

      attemptCount++;
      setAttempts(attemptCount);

      if (attemptCount < maxAttempts) {
        setTimeout(checkBackend, 500);
      } else {
        setError('Backend server failed to start after 30 seconds. Common issues:\n• Node.js not installed or not in PATH\n• Backend folder not found\n• Port 4000 already in use\n\nCheck logs at: %APPDATA%\\com.max.desktop\\data\\logs\\backend.log');
      }
    };

    // Try to listen for Tauri backend-ready event if available
    // Use dynamic import to avoid build errors when Tauri API isn't available
    if (typeof window !== 'undefined' && isDesktopApp()) {
      // Dynamically import Tauri event API
      import('@tauri-apps/api/event')
        .then((eventModule) => {
          // Listen for backend-ready event
          eventModule.listen('backend-ready', () => {
            setBackendReady(true);
            setError(null);
          }).catch(() => {
            // Event listener failed, fall back to polling
          });

          // Listen for backend-error event
          eventModule.listen('backend-error', (event: any) => {
            const errorMsg = event.payload || 'Backend failed to start';
            setError(errorMsg);
            cancelled = true; // Stop polling if we got an error event
          }).catch(() => {
            // Event listener failed, fall back to polling
          });
        })
        .catch(() => {
          // Tauri event API not available, fall back to polling
          setTimeout(checkBackend, 1000);
        });
    }
    
    // Always start polling as a fallback (works even if events fail)
    setTimeout(checkBackend, 1000);

    // Cleanup function
    return () => {
      cancelled = true;
    };
  }, [mounted, backendReady]);

  // During SSR or before mount, render children to prevent hydration mismatch
  if (!mounted || backendReady) {
    return <>{children}</>;
  }

  // Show loading screen only after mount and when backend is not ready
  return (
    <div className="min-h-screen bg-pure-black flex items-center justify-center px-8">
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center space-x-2">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sage-green"></div>
          <p className="text-floral-white/70 font-mono text-sm tracking-[0.3em] uppercase">
            Starting backend server...
          </p>
        </div>
        {attempts > 0 && (
          <p className="text-floral-white/50 font-mono text-xs">
            Attempt {attempts} of 60
          </p>
        )}
        {error && (
          <div className="mt-4 p-4 bg-error-red/10 border border-error-red rounded max-w-2xl">
            <p className="text-error-red font-mono text-sm whitespace-pre-line">{error}</p>
            <div className="mt-3 space-y-2 text-floral-white/50 font-mono text-xs">
              <p><strong>Troubleshooting steps:</strong></p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Check if Node.js is installed: Open PowerShell and run <code className="bg-black/30 px-1">node --version</code></li>
                <li>Check the log file: <code className="bg-black/30 px-1">%APPDATA%\com.max.desktop\data\logs\backend.log</code></li>
                <li>Verify the backend folder exists next to the executable</li>
                <li>Check if port 4000 is already in use</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


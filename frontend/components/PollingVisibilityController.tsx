'use client';

import { useEffect } from 'react';
import { PollingManager } from '@/utils/PollingManager';

/**
 * Global visibility controller that pauses/resumes all polling
 * when the tab becomes hidden/visible.
 * 
 * This ensures MAX does not hammer the backend in background tabs
 * and prevents unnecessary UI re-renders.
 */
export function PollingVisibilityController() {
  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        PollingManager.pauseAll();
      } else {
        PollingManager.resumeAll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // This component doesn't render anything
  return null;
}


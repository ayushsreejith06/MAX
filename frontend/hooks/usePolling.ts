'use client';

import { useEffect, useRef } from 'react';

export interface UsePollingOptions {
  /**
   * Minimum interval in milliseconds between API calls.
   * Default: 2500ms (2.5 seconds)
   */
  interval?: number;
  /**
   * Whether polling is enabled. Default: true
   */
  enabled?: boolean;
  /**
   * Whether to pause polling when page is not visible. Default: true
   */
  pauseWhenHidden?: boolean;
  /**
   * Callback function to execute on each poll
   */
  callback: () => void | Promise<void>;
  /**
   * Whether to execute callback immediately on mount. Default: true
   */
  immediate?: boolean;
}

/**
 * Centralized polling utility hook that:
 * - Ensures minimum interval between API calls (2500ms minimum)
 * - Pauses when page is not visible (using Visibility API)
 * - Prevents multiple simultaneous calls (overlapping requests)
 * - Properly cleans up on unmount
 * - Only runs in useEffect (never in render cycle)
 */
export function usePolling({
  interval = 2500,
  enabled = true,
  pauseWhenHidden = true,
  callback,
  immediate = true,
}: UsePollingOptions) {
  // Ensure minimum interval of 2500ms
  const actualInterval = Math.max(2500, interval);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingRef = useRef(false);
  const lastCallTimeRef = useRef<number>(0);
  const isMountedRef = useRef(true);
  const callbackRef = useRef(callback);
  const enabledRef = useRef(enabled);
  const pauseWhenHiddenRef = useRef(pauseWhenHidden);
  const isVisibleRef = useRef(!pauseWhenHidden || (typeof document !== 'undefined' ? !document.hidden : true));

  // Keep refs up to date
  useEffect(() => {
    callbackRef.current = callback;
    enabledRef.current = enabled;
    pauseWhenHiddenRef.current = pauseWhenHidden;
  }, [callback, enabled, pauseWhenHidden]);

  // Track visibility state
  useEffect(() => {
    if (pauseWhenHidden && typeof document !== 'undefined') {
      isVisibleRef.current = !document.hidden;
    }
  }, [pauseWhenHidden]);

  useEffect(() => {
    isMountedRef.current = true;

    const executeCallback = async () => {
      // Prevent multiple simultaneous calls
      if (isFetchingRef.current || !isMountedRef.current) {
        return;
      }

      // Check if polling is enabled
      if (!enabledRef.current) {
        return;
      }

      // Enforce minimum interval
      const now = Date.now();
      const timeSinceLastCall = now - lastCallTimeRef.current;
      if (timeSinceLastCall < actualInterval && lastCallTimeRef.current > 0) {
        // Schedule next call after remaining time
        const remainingTime = actualInterval - timeSinceLastCall;
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          if (isMountedRef.current && enabledRef.current) {
            void executeCallback();
          }
        }, remainingTime);
        return;
      }

      // Check visibility
      if (pauseWhenHiddenRef.current && !isVisibleRef.current) {
        return;
      }

      try {
        isFetchingRef.current = true;
        lastCallTimeRef.current = Date.now();
        await callbackRef.current();
      } catch (error) {
        console.error('Polling callback error:', error);
      } finally {
        isFetchingRef.current = false;
      }
    };

    // Set up visibility change handler
    let handleVisibilityChange: (() => void) | null = null;
    if (pauseWhenHidden && typeof document !== 'undefined') {
      handleVisibilityChange = () => {
        isVisibleRef.current = !document.hidden;
        
        // If page becomes visible and we're enabled, trigger immediate update
        if (!document.hidden && enabledRef.current && isMountedRef.current && !isFetchingRef.current) {
          // Reset last call time to allow immediate update when tab becomes visible
          lastCallTimeRef.current = 0;
          void executeCallback();
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      isVisibleRef.current = !document.hidden;
    }

    // Initial call if enabled and immediate
    if (enabled && immediate) {
      lastCallTimeRef.current = 0; // Allow immediate execution
      void executeCallback();
    }

    // Set up polling interval
    if (enabled) {
      intervalRef.current = setInterval(() => {
        if (isMountedRef.current && enabledRef.current) {
          // Check visibility before executing
          if (!pauseWhenHiddenRef.current || isVisibleRef.current) {
            void executeCallback();
          }
        }
      }, actualInterval);
    }

    return () => {
      isMountedRef.current = false;
      if (handleVisibilityChange) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      isFetchingRef.current = false;
    };
  }, [enabled, actualInterval, pauseWhenHidden, immediate]);
}


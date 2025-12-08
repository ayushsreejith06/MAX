'use client';

import { useEffect, useRef } from 'react';

export interface UsePollingOptions {
  /**
   * Minimum interval in milliseconds between API calls.
   * Default: 5000ms (5 seconds)
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
 * - Ensures minimum interval between API calls (5000ms minimum)
 * - Pauses when page is not visible (using Visibility API)
 * - Prevents multiple simultaneous calls (overlapping requests)
 * - Waits for previous request to finish before scheduling next one
 * - Handles rate-limited requests (skipped: true) by waiting full interval
 * - Properly cleans up on unmount
 * - Only runs in useEffect (never in render cycle)
 */
export function usePolling({
  interval = 5000,
  enabled = true,
  pauseWhenHidden = true,
  callback,
  immediate = true,
}: UsePollingOptions) {
  // Ensure minimum interval of 5000ms (5 seconds)
  const actualInterval = Math.max(5000, interval);
  
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

    const scheduleNextPoll = (wasSkipped: boolean = false) => {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      const now = Date.now();
      const timeSinceLastCall = now - lastCallTimeRef.current;

      // If request was skipped, always wait the full interval from now
      // This prevents rapid retries when rate limited
      if (wasSkipped) {
        console.debug(`[usePolling] Request was skipped, waiting full interval (${actualInterval}ms) before next poll`);
        timeoutRef.current = setTimeout(() => {
          if (isMountedRef.current && enabledRef.current) {
            void executeCallback();
          }
        }, actualInterval);
        return;
      }

      // For successful requests, ensure minimum interval is respected
      // Calculate when the next poll should happen: lastCallTime + interval
      const nextPollTime = lastCallTimeRef.current + actualInterval;
      const remainingTime = Math.max(0, nextPollTime - now);

      // Schedule for the remaining time (executeCallback will double-check the interval)
      console.debug(`[usePolling] Scheduling next poll in ${remainingTime}ms (timeSinceLastCall: ${timeSinceLastCall}ms)`);

      timeoutRef.current = setTimeout(() => {
        if (isMountedRef.current && enabledRef.current) {
          void executeCallback();
        }
      }, remainingTime);
    };

    const executeCallback = async () => {
      // Prevent multiple simultaneous calls
      if (isFetchingRef.current) {
        console.debug('[usePolling] Skipping poll - previous request still in progress');
        return;
      }

      if (!isMountedRef.current) {
        console.debug('[usePolling] Skipping poll - component unmounted');
        return;
      }

      // Check if polling is enabled
      if (!enabledRef.current) {
        console.debug('[usePolling] Skipping poll - polling disabled');
        return;
      }

      // Enforce minimum interval
      const now = Date.now();
      const timeSinceLastCall = now - lastCallTimeRef.current;
      if (timeSinceLastCall < actualInterval && lastCallTimeRef.current > 0) {
        // Schedule next call after remaining time
        const remainingTime = actualInterval - timeSinceLastCall;
        console.debug(`[usePolling] Too soon since last call (${timeSinceLastCall}ms < ${actualInterval}ms), scheduling in ${remainingTime}ms`);
        scheduleNextPoll(false);
        return;
      }

      // Check visibility
      if (pauseWhenHiddenRef.current && !isVisibleRef.current) {
        console.debug('[usePolling] Skipping poll - page not visible');
        // Schedule next poll anyway, in case visibility changes
        scheduleNextPoll(false);
        return;
      }

      try {
        isFetchingRef.current = true;
        lastCallTimeRef.current = Date.now();
        console.debug('[usePolling] Executing poll callback');
        
        const result = await callbackRef.current();
        
        // Check if the callback returned { skipped: true } (rate limited)
        const wasSkipped = result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true;
        
        if (wasSkipped) {
          console.debug('[usePolling] Poll was skipped (rate limited), waiting full interval before next poll');
        } else {
          console.debug('[usePolling] Poll completed successfully');
        }

        // Schedule next poll after current one finishes
        // If skipped, wait full interval; otherwise respect minimum interval
        scheduleNextPoll(wasSkipped);
      } catch (error) {
        console.debug('[usePolling] Poll callback error:', error);
        // On error, still schedule next poll after full interval
        scheduleNextPoll(false);
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
          console.debug('[usePolling] Page became visible, triggering immediate poll');
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
    } else if (enabled) {
      // If not immediate, schedule first poll
      scheduleNextPoll(false);
    }

    return () => {
      isMountedRef.current = false;
      if (handleVisibilityChange) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      isFetchingRef.current = false;
    };
  }, [enabled, actualInterval, pauseWhenHidden, immediate]);
}


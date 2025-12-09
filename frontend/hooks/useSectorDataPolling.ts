'use client';

import { useCallback, useRef } from 'react';
import { fetchSectorById, isSkippedResult } from '@/lib/api';
import type { Sector } from '@/lib/types';
import { usePolling } from './usePolling';

export interface UseSectorDataPollingOptions {
  sectorId: string | null | undefined;
  enabled?: boolean;
  interval?: number; // Polling interval in ms (default: 1500ms, minimum: 1000ms)
  onSectorUpdate?: (sector: Sector) => void;
}

/**
 * Hook to poll sector data including simulated price at regular intervals (1-2 seconds)
 * Uses internal rate limiter to prevent request spam
 * 
 * Features:
 * - Polls sector data every 1-2 seconds (configurable, minimum 1 second)
 * - Updates simulated price, performance, and other sector metrics
 * - Respects rate limiting (minimum 1 second interval enforced)
 * - Prevents unnecessary re-renders by only updating when data changes
 */
export function useSectorDataPolling({
  sectorId,
  enabled = true,
  interval = 1500, // Default 1.5 seconds
  onSectorUpdate,
}: UseSectorDataPollingOptions) {
  const previousSectorRef = useRef<Sector | null>(null);
  const lastSimulatedPriceRef = useRef<number | null | undefined>(undefined);

  // Ensure minimum interval of 1 second
  const actualInterval = Math.max(1000, interval);

  const pollSectorData = useCallback(async () => {
    if (!sectorId || !enabled) return;

    try {
      const sector = await fetchSectorById(sectorId);
      
      // Handle rate limiting - don't update if skipped
      if (isSkippedResult(sector) || !sector) {
        return;
      }

      // Only update if data actually changed to prevent unnecessary re-renders
      const prevSector = previousSectorRef.current;
      const hasChanged = !prevSector || 
        prevSector.lastSimulatedPrice !== sector.lastSimulatedPrice ||
        prevSector.currentPrice !== sector.currentPrice ||
        prevSector.balance !== sector.balance ||
        prevSector.performance !== sector.performance ||
        prevSector.activeAgents !== sector.activeAgents ||
        prevSector.statusPercent !== sector.statusPercent ||
        JSON.stringify(prevSector.candleData) !== JSON.stringify(sector.candleData);

      if (hasChanged) {
        previousSectorRef.current = sector;
        lastSimulatedPriceRef.current = sector.lastSimulatedPrice;
        onSectorUpdate?.(sector);
      }
    } catch (error) {
      // Silently fail during polling - don't show errors for background updates
      console.debug('[useSectorDataPolling] Failed to poll sector data:', error);
    }
  }, [sectorId, enabled, onSectorUpdate]);

  // Use polling hook with configured interval
  usePolling({
    callback: pollSectorData,
    interval: actualInterval,
    enabled: enabled && !!sectorId,
    pauseWhenHidden: true,
    immediate: false, // Don't call immediately, wait for first poll
    allowLowerInterval: true, // Allow intervals below 5 seconds (we enforce 1 second minimum)
  });

  return {
    lastSimulatedPrice: lastSimulatedPriceRef.current,
  };
}


'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { fetchSectorById, fetchAgents, fetchDiscussions, isSkippedResult } from '@/lib/api';
import type { Sector, Agent, Discussion } from '@/lib/types';
import { usePolling } from './usePolling';

export interface ExecutionRefreshCallbacks {
  onSectorUpdate?: (sector: Sector) => void;
  onAgentsUpdate?: (agents: Agent[]) => void;
  onDiscussionsUpdate?: (discussions: Discussion[]) => void;
  onExecutionDetected?: () => void;
}

export interface UseExecutionRefreshOptions {
  sectorId: string | null | undefined;
  enabled?: boolean;
  fastPollInterval?: number; // Interval for fast polling after execution (default: 650ms)
  normalPollInterval?: number; // Normal polling interval (default: 5000ms)
  callbacks?: ExecutionRefreshCallbacks;
}

/**
 * Hook to detect execution completion and manage immediate refresh + fast polling
 * 
 * Detects execution by comparing sector values (capital, pnl, utilization, trend)
 * When changes are detected, immediately refreshes all data and starts fast polling
 */
export function useExecutionRefresh({
  sectorId,
  enabled = true,
  fastPollInterval = 650,
  normalPollInterval = 5000,
  callbacks = {},
}: UseExecutionRefreshOptions) {
  const [isFastPolling, setIsFastPolling] = useState(false);
  const [highlightedFields, setHighlightedFields] = useState<Set<string>>(new Set());
  const previousSectorRef = useRef<Sector | null>(null);
  const fastPollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const executionDetectedRef = useRef(false);

  // Track previous values for comparison
  const previousValuesRef = useRef<{
    balance?: number;
    performance?: { totalPL?: number };
    activeAgents?: number;
    statusPercent?: number;
    currentPrice?: number;
    change?: number;
    changePercent?: number;
    lastSimulatedPrice?: number | null;
  }>({});

  // Clear fast polling timeout
  const clearFastPollTimeout = useCallback(() => {
    if (fastPollTimeoutRef.current) {
      clearTimeout(fastPollTimeoutRef.current);
      fastPollTimeoutRef.current = null;
    }
  }, []);

  // Start fast polling after execution detection
  const startFastPolling = useCallback(() => {
    if (isFastPolling) return; // Already fast polling
    
    setIsFastPolling(true);
    executionDetectedRef.current = true;
    callbacks.onExecutionDetected?.();

    // Stop fast polling after 30 seconds (enough time for values to stabilize)
    clearFastPollTimeout();
    fastPollTimeoutRef.current = setTimeout(() => {
      setIsFastPolling(false);
      executionDetectedRef.current = false;
      // Clear highlights after fast polling stops
      setTimeout(() => {
        setHighlightedFields(new Set());
      }, 1000);
    }, 30000);
  }, [isFastPolling, callbacks, clearFastPollTimeout]);

  // Detect execution by comparing sector values
  const detectExecution = useCallback((currentSector: Sector) => {
    if (!currentSector) return false;

    const prev = previousValuesRef.current;
    const current = {
      balance: currentSector.balance,
      performance: currentSector.performance,
      activeAgents: currentSector.activeAgents,
      statusPercent: currentSector.statusPercent,
      currentPrice: currentSector.currentPrice,
      change: currentSector.change,
      changePercent: currentSector.changePercent,
      lastSimulatedPrice: currentSector.lastSimulatedPrice,
    };

    // Check if any tracked values changed (indicating execution)
    const fieldsToCheck = [
      { key: 'balance', prev: prev.balance, curr: current.balance },
      { key: 'totalPL', prev: prev.performance?.totalPL, curr: current.performance?.totalPL },
      { key: 'activeAgents', prev: prev.activeAgents, curr: current.activeAgents },
      { key: 'statusPercent', prev: prev.statusPercent, curr: current.statusPercent },
      { key: 'currentPrice', prev: prev.currentPrice, curr: current.currentPrice },
      { key: 'change', prev: prev.change, curr: current.change },
      { key: 'changePercent', prev: prev.changePercent, curr: current.changePercent },
      { key: 'lastSimulatedPrice', prev: prev.lastSimulatedPrice, curr: current.lastSimulatedPrice },
    ];

    const changedFields = new Set<string>();
    let hasChanges = false;

    for (const { key, prev, curr } of fieldsToCheck) {
      if (prev !== undefined && curr !== undefined && prev !== curr) {
        hasChanges = true;
        changedFields.add(key);
      }
    }

    // Update previous values
    previousValuesRef.current = {
      balance: current.balance,
      performance: current.performance,
      activeAgents: current.activeAgents,
      statusPercent: current.statusPercent,
      currentPrice: current.currentPrice,
      change: current.change,
      changePercent: current.changePercent,
      lastSimulatedPrice: current.lastSimulatedPrice,
    };

    if (hasChanges && !executionDetectedRef.current) {
      // Highlight changed fields
      setHighlightedFields(changedFields);
      // Clear highlights after animation duration
      setTimeout(() => {
        setHighlightedFields(prev => {
          const next = new Set(prev);
          changedFields.forEach(field => next.delete(field));
          return next;
        });
      }, 2000);
      
      return true;
    }

    return false;
  }, []);

  // Refresh sector data
  const refreshSector = useCallback(async () => {
    if (!sectorId) return null;

    try {
      const sector = await fetchSectorById(sectorId);
      if (isSkippedResult(sector) || !sector) {
        return previousSectorRef.current;
      }

      // Detect execution
      const executionDetected = detectExecution(sector);
      if (executionDetected) {
        startFastPolling();
      }

      previousSectorRef.current = sector;
      callbacks.onSectorUpdate?.(sector);
      return sector;
    } catch (error) {
      console.error('[useExecutionRefresh] Failed to refresh sector:', error);
      return previousSectorRef.current;
    }
  }, [sectorId, detectExecution, startFastPolling, callbacks]);

  // Refresh agents data
  const refreshAgents = useCallback(async () => {
    if (!sectorId) return [];

    try {
      const agents = await fetchAgents();
      if (isSkippedResult(agents) || !Array.isArray(agents)) {
        return [];
      }

      const sectorAgents = agents.filter(agent => 
        agent.sectorId && agent.sectorId.toLowerCase() === sectorId.toLowerCase()
      );

      callbacks.onAgentsUpdate?.(sectorAgents);
      return sectorAgents;
    } catch (error) {
      console.error('[useExecutionRefresh] Failed to refresh agents:', error);
      return [];
    }
  }, [sectorId, callbacks]);

  // Refresh discussions data
  const refreshDiscussions = useCallback(async () => {
    if (!sectorId) return [];

    try {
      const discussions = await fetchDiscussions();
      if (isSkippedResult(discussions) || !Array.isArray(discussions)) {
        return [];
      }

      const sectorDiscussions = discussions.filter(discussion =>
        discussion.sectorId && 
        discussion.sectorId.toLowerCase() === sectorId.toLowerCase() &&
        discussion.status !== 'closed' &&
        discussion.status !== 'archived'
      );

      callbacks.onDiscussionsUpdate?.(sectorDiscussions);
      return sectorDiscussions;
    } catch (error) {
      console.error('[useExecutionRefresh] Failed to refresh discussions:', error);
      return [];
    }
  }, [sectorId, callbacks]);

  // Immediate refresh function (called when execution is detected)
  const immediateRefresh = useCallback(async () => {
    if (!sectorId) return;

    // Refresh all data immediately
    await Promise.all([
      refreshSector(),
      refreshAgents(),
      refreshDiscussions(),
    ]);
  }, [sectorId, refreshSector, refreshAgents, refreshDiscussions]);

  // Polling callback - uses fast or normal interval based on state
  const pollCallback = useCallback(async () => {
    if (!sectorId || !enabled) return;

    await Promise.all([
      refreshSector(),
      refreshAgents(),
      refreshDiscussions(),
    ]);
  }, [sectorId, enabled, refreshSector, refreshAgents, refreshDiscussions]);

  // Use polling with dynamic interval
  usePolling({
    callback: pollCallback,
    interval: isFastPolling ? fastPollInterval : normalPollInterval,
    enabled: enabled && !!sectorId,
    pauseWhenHidden: true,
    immediate: false,
    allowLowerInterval: true,
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearFastPollTimeout();
    };
  }, [clearFastPollTimeout]);

  return {
    isFastPolling,
    highlightedFields,
    immediateRefresh,
    refreshSector,
    refreshAgents,
    refreshDiscussions,
  };
}


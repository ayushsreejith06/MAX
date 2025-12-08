'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCcw, Link as LinkIcon } from 'lucide-react';
import { fetchContractEvents } from '@/lib/mnee';
import { isRateLimitError } from '@/lib/api';
import { usePolling } from '@/hooks/usePolling';
import { PollingManager } from '@/utils/PollingManager';

/**
 * Contract Activity Page
 * 
 * Displays all on-chain events (sector registrations, agent registrations, trade logs)
 * from the smart contract. Shows event type, actor (creator), timestamp, and event data.
 * 
 * Features:
 * - Auto-refresh every 15 seconds
 * - Manual refresh button
 * - Table view with sortable events
 */
interface ContractEvent {
  type: 'sector' | 'agent' | 'trade';
  actor: string | null;
  timestamp: number | null;
  data: {
    id: string;
    [key: string]: any;
  };
}

interface ContractEventsResponse {
  success: boolean;
  events: ContractEvent[];
  counts: {
    sectors: number;
    agents: number;
    trades: number;
  };
}

export default function ContractActivity() {
  const [events, setEvents] = useState<ContractEvent[]>([]);
  const [counts, setCounts] = useState({ sectors: 0, agents: 0, trades: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  /**
   * Fetches contract events from the backend API
   */
  const loadEvents = useCallback(async (showSpinner = false) => {
    try {
      if (showSpinner) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError(null);

      const response: ContractEventsResponse = await fetchContractEvents();
      
      if (response && response.success) {
        setEvents(response.events || []);
        setCounts(response.counts || { sectors: 0, agents: 0, trades: 0 });
        setLastUpdated(new Date());
      } else if (response && Array.isArray(response.events)) {
        // If response doesn't have success field, treat as valid
        setEvents(response.events || []);
        setCounts(response.counts || { sectors: 0, agents: 0, trades: 0 });
        setLastUpdated(new Date());
      } else {
        // Empty response is valid (no events yet)
        setEvents([]);
        setCounts({ sectors: 0, agents: 0, trades: 0 });
        setLastUpdated(new Date());
      }
    } catch (err: any) {
      // Only handle actual server rate limit errors (HTTP 429)
      // Skipped calls from rateLimitedFetch don't throw errors
      if (isRateLimitError(err)) {
        console.debug('Server rate limited, will retry automatically');
        return;
      }
      console.error('Failed to fetch contract events', err);
      // Handle different error status codes
      const status = err?.status;
      const message = err?.message || '';
      
      if (status === 503 || message.toLowerCase().includes('not initialized') || message.toLowerCase().includes('contract not initialized') || message.toLowerCase().includes('contract address not configured')) {
        // Contract not configured - show empty state with helpful message
        setEvents([]);
        setCounts({ sectors: 0, agents: 0, trades: 0 });
        setLastUpdated(new Date());
        setError('Smart contract not configured. To view on-chain events, set the MAX_REGISTRY environment variable in your backend .env file with your deployed contract address.');
      } else if (status === 404 || message.includes('404') || message.includes('Not Found')) {
        setError('Contract events endpoint not found. Please ensure the backend is running.');
      } else {
        const errorMessage = message || 'Unable to load contract events. Please ensure the backend is running and the contract is configured.';
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Auto-refresh callback - memoized to prevent re-registration
  const pollEvents = useCallback(() => {
    void loadEvents(false);
  }, [loadEvents]);

  // Initial load
  useEffect(() => {
    void loadEvents(true);
  }, [loadEvents]);

  // Use global PollingManager for auto-refresh
  useEffect(() => {
    const pollEvents = () => loadEvents(false);
    PollingManager.register('contract-activity', pollEvents, 15000);
    return () => {
      PollingManager.unregister('contract-activity');
    };
  }, [loadEvents]);

  const formatTimestamp = (timestamp: number | null): string => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp * 1000); // Convert Unix timestamp to milliseconds
    return date.toLocaleString();
  };

  const formatAddress = (address: string | null): string => {
    if (!address) return 'N/A';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getEventTypeLabel = (type: string): string => {
    switch (type) {
      case 'sector':
        return 'Sector Registered';
      case 'agent':
        return 'Agent Registered';
      case 'trade':
        return 'Trade Logged';
      default:
        return type;
    }
  };

  const getEventTypeColor = (type: string): string => {
    switch (type) {
      case 'sector':
        return 'bg-sage-green/15 text-sage-green border border-sage-green/30';
      case 'agent':
        return 'bg-warning-amber/15 text-warning-amber border border-warning-amber/30';
      case 'trade':
        return 'bg-sky-blue/15 text-sky-blue border border-sky-blue/30';
      default:
        return 'bg-ink-600/15 text-floral-white/70 border border-ink-500/30';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-pure-black px-8 py-10">
        <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-8">
          <p className="text-floral-white/70 font-mono">Loading contract activity...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pure-black px-8 py-10">
      <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-8">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-[0.35em] text-floral-white font-mono">
              On-Chain Activity
            </h1>
            <p className="mt-2 text-base text-floral-white/70">
              View all sector registrations, agent registrations, and trade logs recorded on the blockchain.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => loadEvents(false)}
              disabled={isRefreshing}
              className="flex items-center gap-2 rounded-xl border border-ink-500 bg-card-bg/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-floral-white/80 hover:border-sage-green transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCcw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-sage-green' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            {lastUpdated && (
              <span className="text-xs text-floral-white/60 font-mono">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-ink-500/80 bg-card-bg/80 p-6">
            <p className="text-[0.65rem] uppercase tracking-[0.4em] text-floral-white/60 font-mono">Sectors on Chain</p>
            <p className="mt-2 text-3xl font-bold text-sage-green font-mono">{counts.sectors}</p>
            <p className="text-xs text-floral-white/60 mt-1">Registered sectors</p>
          </div>
          <div className="rounded-2xl border border-ink-500/80 bg-card-bg/80 p-6">
            <p className="text-[0.65rem] uppercase tracking-[0.4em] text-floral-white/60 font-mono">Agents on Chain</p>
            <p className="mt-2 text-3xl font-bold text-warning-amber font-mono">{counts.agents}</p>
            <p className="text-xs text-floral-white/60 mt-1">Registered agents</p>
          </div>
          <div className="rounded-2xl border border-ink-500/80 bg-card-bg/80 p-6">
            <p className="text-[0.65rem] uppercase tracking-[0.4em] text-floral-white/60 font-mono">On-Chain Trades</p>
            <p className="mt-2 text-3xl font-bold text-sky-blue font-mono">{counts.trades}</p>
            <p className="text-xs text-floral-white/60 mt-1">Logged trades</p>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="rounded-2xl border border-error-red/50 bg-error-red/10 p-6">
            <p className="text-error-red font-mono">{error}</p>
            <button
              onClick={() => loadEvents(true)}
              className="mt-4 rounded-full border border-error-red px-4 py-2 text-xs uppercase tracking-[0.3em] text-error-red hover:bg-error-red/10 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Events Table */}
        <div className="rounded-3xl border border-ink-500 bg-card-bg/80 overflow-hidden">
          <div className="px-5 py-4 border-b border-ink-500/70">
            <h3 className="text-sm font-semibold text-floral-white uppercase tracking-[0.32em] font-mono">
              Contract Events
            </h3>
            <p className="text-xs text-floral-white/60 font-mono mt-1">
              {events.length} total events • Auto-refreshes every 15 seconds
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border border-ink-500 bg-card-bg font-mono text-[0.85rem]">
              <thead>
                <tr className="bg-ink-600 text-floral-white/70 uppercase tracking-[0.2em]">
                  {['Event Type', 'Actor', 'Timestamp', 'Data'].map((heading) => (
                    <th key={heading} className="px-4 py-3 border border-ink-500 text-left text-[0.6rem]">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-floral-white/60 font-mono">
                      {error 
                        ? 'Unable to load events. Please check contract configuration.'
                        : 'No contract events found. Events will appear here once sectors, agents, or trades are registered on-chain.'}
                    </td>
                  </tr>
                ) : (
                  events.map((event, index) => (
                    <tr
                      key={`${event.type}-${event.data.id}-${index}`}
                      className={`transition-colors ${
                        index % 2 === 0 ? 'bg-shadow-grey/60' : 'bg-shadow-grey/40'
                      } hover:bg-shadow-grey/80`}
                    >
                      <td className="px-4 py-3 border border-ink-500">
                        <span className={`inline-block px-3 py-1 rounded-full text-[0.65rem] font-semibold uppercase tracking-[0.2em] ${getEventTypeColor(event.type)}`}>
                          {getEventTypeLabel(event.type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 border border-ink-500 text-floral-white/80 font-mono text-xs">
                        {formatAddress(event.actor)}
                      </td>
                      <td className="px-4 py-3 border border-ink-500 text-floral-white/80 font-mono text-xs">
                        {formatTimestamp(event.timestamp)}
                      </td>
                      <td className="px-4 py-3 border border-ink-500 text-floral-white/70 text-xs">
                        <div className="flex flex-col gap-1">
                          {event.type === 'sector' && (
                            <>
                              <span><strong>ID:</strong> {event.data.id}</span>
                              <span><strong>Name:</strong> {event.data.name}</span>
                              <span><strong>Symbol:</strong> {event.data.symbol}</span>
                            </>
                          )}
                          {event.type === 'agent' && (
                            <>
                              <span><strong>ID:</strong> {event.data.id}</span>
                              <span><strong>Sector ID:</strong> {event.data.sectorId}</span>
                              <span><strong>Role:</strong> {event.data.role}</span>
                            </>
                          )}
                          {event.type === 'trade' && (
                            <>
                              <span><strong>ID:</strong> {event.data.id}</span>
                              <span><strong>Agent ID:</strong> {event.data.agentId}</span>
                              <span><strong>Sector ID:</strong> {event.data.sectorId}</span>
                              <span><strong>Action:</strong> {event.data.action}</span>
                              <span><strong>Amount:</strong> {event.data.amount}</span>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}


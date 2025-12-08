'use client';

import React, { useEffect, useState, useRef, memo, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp, TrendingDown, Users, Activity, MessageSquare, Plus, X, Trash2 } from 'lucide-react';
import isEqual from 'lodash.isequal';
import { fetchSectors, createSector, deleteSector } from '@/lib/api';
import type { Sector } from '@/lib/types';
import { PollingManager } from '@/utils/PollingManager';

export default function SectorsPage() {
  const router = useRouter();
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({ sectorName: '', sectorSymbol: '' });
  const [createError, setCreateError] = useState<string | null>(null);
  const [deletingSectorId, setDeletingSectorId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ sectorId: string; sectorName: string } | null>(null);
  const [deleteConfirmationCode, setDeleteConfirmationCode] = useState('');
  const isFetchingRef = useRef(false);

  const loadSectors = useCallback(async (showLoading = false) => {
    // Race condition guard: prevent multiple simultaneous fetches
    if (isFetchingRef.current) {
      return;
    }

    try {
      isFetchingRef.current = true;
      // Only show loading spinner on initial load, not on subsequent polls
      if (showLoading) {
        setLoading(true);
      }
      const data = await fetchSectors();
      // Use deep equality check to prevent re-renders when data is structurally identical
      setSectors(prevSectors => {
        if (isEqual(prevSectors, data)) {
          return prevSectors;
        }
        return data;
      });
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch sectors', err);
      const errorMessage = err?.message || 'Unable to load sectors. Please try again.';
      setError(errorMessage);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
      isFetchingRef.current = false;
    }
  }, []);

  // Initial load with loading state
  useEffect(() => {
    void loadSectors(true);
  }, [loadSectors]);

  // Use global PollingManager for centralized polling (without loading state)
  useEffect(() => {
    const pollSectors = () => loadSectors(false);
    PollingManager.register('sectors', pollSectors, 2500);
    return () => {
      PollingManager.unregister('sectors');
    };
  }, [loadSectors]);

  const formatPrice = (price: number) => price.toFixed(2);
  const formatVolume = (volume: number) => {
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
    return volume.toLocaleString();
  };

  const getUtilizationColor = (percent: number) => {
    if (percent >= 30) return 'bg-warning-amber';
    return 'bg-error-red';
  };

  const handleCreateSector = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);

    try {
      const newSector = await createSector(formData.sectorName, formData.sectorSymbol);
      setSectors(prev => [...prev, newSector]);
      setShowCreateForm(false);
      setFormData({ sectorName: '', sectorSymbol: '' });
      // Reload sectors to get the manager agent that was created
      const data = await fetchSectors();
      setSectors(data);
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create sector');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSector = useCallback(async (sectorId: string, sectorName: string) => {
    // First confirmation
    if (!confirm(`Are you sure you want to delete "${sectorName}"? This action cannot be undone and will withdraw all balance to your account.`)) {
      return;
    }

    // Show second confirmation with code input
    setShowDeleteConfirm({ sectorId, sectorName });
    setDeleteConfirmationCode('');
  }, []);

  const confirmDeleteSector = async () => {
    if (!showDeleteConfirm) return;

    const { sectorId, sectorName } = showDeleteConfirm;

    // Verify confirmation code matches sector name
    if (deleteConfirmationCode.trim().toLowerCase() !== sectorName.toLowerCase()) {
      alert('Confirmation code does not match. Please enter the exact sector name.');
      return;
    }

    try {
      setDeletingSectorId(sectorId);
      const result = await deleteSector(sectorId, deleteConfirmationCode);
      
      // Show success message with withdrawn balance
      const balanceMsg = result.withdrawnBalance && result.withdrawnBalance > 0
        ? ` Balance of $${result.withdrawnBalance.toFixed(2)} has been withdrawn to your account.`
        : '';
      alert(`Sector deleted successfully.${balanceMsg}`);
      
      // Reload sectors
      const data = await fetchSectors();
      setSectors(data);
      
      // Close confirmation dialog
      setShowDeleteConfirm(null);
      setDeleteConfirmationCode('');
    } catch (error: any) {
      console.error('Failed to delete sector', error);
      const errorMessage = error?.message || 'Failed to delete sector';
      if (errorMessage.includes('Invalid confirmation code')) {
        alert('Invalid confirmation code. Please enter the exact sector name.');
      } else {
        alert(`Failed to delete sector: ${errorMessage}`);
      }
    } finally {
      setDeletingSectorId(null);
    }
  };

  return (
    <div className="min-h-screen bg-pure-black">
      <div className="max-w-[1920px] mx-auto px-8 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-floral-white mb-2 font-mono uppercase">SECTORS</h1>
            <p className="text-floral-white/70 font-mono">
              {sectors.length ? `${sectors.length} active sectors` : 'No sectors available'} • Click to view details
            </p>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 rounded-full bg-sage-green px-5 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-pure-black hover:bg-sage-green/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Sector
          </button>
        </div>

        {error && (
          <p className="text-error-red text-sm font-mono mb-4">{error}</p>
        )}

        {showCreateForm && (
          <div className="mb-6 bg-shadow-grey rounded-lg p-6 border border-shadow-grey">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-floral-white font-mono uppercase">Create New Sector</h2>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setFormData({ sectorName: '', sectorSymbol: '' });
                  setCreateError(null);
                }}
                className="text-floral-white/70 hover:text-floral-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSector} className="space-y-4">
              <div>
                <label className="block text-sm text-floral-white/70 font-mono mb-2 uppercase tracking-[0.2em]">
                  Sector Name
                </label>
                <input
                  type="text"
                  value={formData.sectorName}
                  onChange={(e) => setFormData(prev => ({ ...prev, sectorName: e.target.value }))}
                  className="w-full rounded-lg border border-ink-500 bg-ink-600/70 px-4 py-2 text-floral-white font-mono focus:outline-none focus:border-sage-green focus:ring-1 focus:ring-sage-green"
                  placeholder="e.g., Technology"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-floral-white/70 font-mono mb-2 uppercase tracking-[0.2em]">
                  Sector Symbol
                </label>
                <input
                  type="text"
                  value={formData.sectorSymbol}
                  onChange={(e) => setFormData(prev => ({ ...prev, sectorSymbol: e.target.value.toUpperCase() }))}
                  className="w-full rounded-lg border border-ink-500 bg-ink-600/70 px-4 py-2 text-floral-white font-mono focus:outline-none focus:border-sage-green focus:ring-1 focus:ring-sage-green uppercase"
                  placeholder="e.g., TECH"
                  maxLength={10}
                  required
                />
              </div>
              {createError && (
                <p className="text-error-red text-sm font-mono">{createError}</p>
              )}
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-full bg-sage-green px-5 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-pure-black hover:bg-sage-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? 'Creating...' : 'Create Sector'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setFormData({ sectorName: '', sectorSymbol: '' });
                    setCreateError(null);
                  }}
                  className="rounded-full border border-ink-500 px-5 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-floral-white hover:border-sage-green transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <p className="text-floral-white/70 font-mono">Loading sectors...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {sectors.map((sector) => (
              <SectorCard
                key={sector.id}
                sector={sector}
                onNavigate={() => router.push(`/sectors/${sector.id}`)}
                onDelete={() => handleDeleteSector(sector.id, sector.name)}
                isDeleting={deletingSectorId === sector.id}
              />
            ))}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-shadow-grey rounded-lg p-6 border border-ink-500 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold text-floral-white mb-4 font-mono uppercase">Confirm Deletion</h2>
              <p className="text-floral-white/70 mb-4 font-mono">
                To confirm deletion of <span className="font-bold text-floral-white">"{showDeleteConfirm.sectorName}"</span>, please enter the exact sector name below.
              </p>
              <p className="text-warning-amber text-sm mb-4 font-mono">
                ⚠️ This will delete the sector and all its agents. The sector balance will be withdrawn to your account.
              </p>
              <input
                type="text"
                value={deleteConfirmationCode}
                onChange={(e) => setDeleteConfirmationCode(e.target.value)}
                placeholder="Enter sector name to confirm"
                className="w-full rounded-lg border border-ink-500 bg-ink-600/70 px-4 py-2 text-floral-white font-mono focus:outline-none focus:border-error-red focus:ring-1 focus:ring-error-red mb-4"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={confirmDeleteSector}
                  disabled={deletingSectorId === showDeleteConfirm.sectorId || !deleteConfirmationCode.trim()}
                  className="flex-1 rounded-full bg-error-red px-5 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-pure-black hover:bg-error-red/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deletingSectorId === showDeleteConfirm.sectorId ? 'Deleting...' : 'Delete Sector'}
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(null);
                    setDeleteConfirmationCode('');
                  }}
                  disabled={deletingSectorId === showDeleteConfirm.sectorId}
                  className="flex-1 rounded-full border border-ink-500 px-5 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-floral-white hover:border-sage-green transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Memoized SectorCard component to prevent unnecessary re-renders
const SectorCard = memo(function SectorCard({
  sector,
  onNavigate,
  onDelete,
  isDeleting,
}: {
  sector: Sector;
  onNavigate: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const formatPrice = (price: number) => price.toFixed(2);
  const formatVolume = (volume: number) => {
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
    return volume.toLocaleString();
  };

  const getUtilizationColor = (percent: number) => {
    if (percent >= 30) return 'bg-warning-amber';
    return 'bg-error-red';
  };

  return (
    <div
      className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey hover:border-sage-green/50 transition-colors relative"
    >
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigate();
                    }}
                    className="flex-1 cursor-pointer"
                  >
                    <h3 className="text-2xl font-bold text-floral-white font-mono">{sector.name}</h3>
                    <p className="text-sm text-floral-white/70 font-mono">{sector.symbol || 'N/A'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      {sector.change >= 0 ? (
                        <TrendingUp className="w-6 h-6 text-sage-green" />
                      ) : (
                        <TrendingDown className="w-6 h-6 text-error-red" />
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                      }}
                      disabled={isDeleting}
                      className="p-2 text-error-red hover:bg-error-red/10 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Delete sector"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Price and Change */}
                <div className="mb-4">
                  <div className="text-3xl font-bold text-floral-white mb-1 font-mono">${formatPrice(sector.currentPrice)}</div>
                  <div className={`text-sm font-medium font-mono ${
                    sector.change >= 0 ? 'text-sage-green' : 'text-error-red'
                  }`}>
                    {sector.change >= 0 ? '+' : ''}{formatPrice(sector.change)} ({sector.changePercent >= 0 ? '+' : ''}{sector.changePercent.toFixed(2)}%)
                  </div>
                </div>

                {/* Metrics */}
                <div
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate();
                  }}
                  className="space-y-3 cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-floral-white/70" />
                      <span className="text-sm text-floral-white/70 font-mono">Total Agents</span>
                    </div>
                    <span className="text-floral-white font-semibold font-mono">{sector.agents.length}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-floral-white/70" />
                      <span className="text-sm text-floral-white/70 font-mono">Active Agents</span>
                    </div>
                    <span className="text-sage-green font-semibold font-mono">{sector.activeAgents}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-floral-white/70 font-mono">Utilization</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-shadow-grey rounded-full overflow-hidden">
                        <div
                          className={`h-full ${getUtilizationColor(sector.statusPercent)}`}
                          style={{ width: `${sector.statusPercent}%` }}
                        />
                      </div>
                      <span className={`text-sm font-semibold font-mono ${
                        sector.statusPercent >= 30 ? 'text-warning-amber' : 'text-error-red'
                      }`}>
                        {sector.statusPercent}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-floral-white/70 font-mono">Volume</span>
                    <span className="text-floral-white font-semibold font-mono">{formatVolume(sector.volume)}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-floral-white/70" />
                      <span className="text-sm text-floral-white/70 font-mono">Discussions</span>
                    </div>
                    <span className="text-floral-white font-semibold font-mono">{sector.discussions.length}</span>
                  </div>
                </div>
              </div>
            );
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  return (
    prevProps.sector.id === nextProps.sector.id &&
    prevProps.sector.name === nextProps.sector.name &&
    prevProps.sector.symbol === nextProps.sector.symbol &&
    prevProps.sector.currentPrice === nextProps.sector.currentPrice &&
    prevProps.sector.change === nextProps.sector.change &&
    prevProps.sector.changePercent === nextProps.sector.changePercent &&
    prevProps.sector.volume === nextProps.sector.volume &&
    prevProps.sector.activeAgents === nextProps.sector.activeAgents &&
    prevProps.sector.agents.length === nextProps.sector.agents.length &&
    prevProps.sector.statusPercent === nextProps.sector.statusPercent &&
    prevProps.sector.discussions.length === nextProps.sector.discussions.length &&
    prevProps.isDeleting === nextProps.isDeleting
  );
});

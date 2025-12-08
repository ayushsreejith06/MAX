'use client';

import React, { useEffect, useState, FormEvent } from 'react';
import type { Agent, Sector } from '@/lib/types';
import { createAgent, fetchSectors } from '@/lib/api';

interface CreateAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (agent: Agent) => void;
  preselectedSectorId?: string;
}

export function CreateAgentModal({
  isOpen,
  onClose,
  onSuccess,
  preselectedSectorId,
}: CreateAgentModalProps) {
  const [prompt, setPrompt] = useState('');
  const [selectedSectorId, setSelectedSectorId] = useState<string>('unassigned');
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [isLoadingSectors, setIsLoadingSectors] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    setPrompt('');
    setSelectedSectorId(preselectedSectorId ?? 'unassigned');

    const loadSectors = async () => {
      try {
        setIsLoadingSectors(true);
        const data = await fetchSectors();
        setSectors(data);
      } catch (err) {
        console.error('Failed to load sectors', err);
        setError('Failed to load sectors. You can still create an unassigned agent.');
      } finally {
        setIsLoadingSectors(false);
      }
    };

    void loadSectors();
  }, [isOpen, preselectedSectorId]);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!prompt.trim()) {
      setError('Prompt is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const sectorIdToSend =
      selectedSectorId === 'unassigned' ? null : selectedSectorId;

    try {
      const agent = await createAgent(prompt.trim(), sectorIdToSend);
      if (onSuccess) {
        onSuccess(agent);
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to create agent', err);
      setError(
        err?.message ?? 'Failed to create agent. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !isSubmitting) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-pure-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-lg rounded-3xl border border-ink-500 bg-card-bg/95 p-6 shadow-2xl">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.35em] text-floral-white">
          Spin New Agent
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.25em] text-floral-white/70">
              Agent Prompt
            </label>
            <textarea
              className="h-28 w-full rounded-2xl border border-ink-500 bg-pure-black/60 px-3 py-2 text-sm text-floral-white placeholder:text-floral-white/40 outline-none transition focus:border-sage-green focus:ring-2 focus:ring-sage-green/40"
              placeholder="e.g., 'trade buy sell market' or 'analyze research forecast'"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.25em] text-floral-white/70">
              Sector (optional)
            </label>
            <select
              className="w-full rounded-2xl border border-ink-500 bg-pure-black/60 px-3 py-2 text-sm text-floral-white outline-none transition focus:border-sage-green focus:ring-2 focus:ring-sage-green/40"
              value={selectedSectorId}
              onChange={(e) => setSelectedSectorId(e.target.value)}
              disabled={isSubmitting || isLoadingSectors}
            >
              <option value="unassigned" className="bg-pure-black text-floral-white">Unassigned (no sector)</option>
              {sectors.map((sector) => (
                <option key={sector.id} value={sector.id} className="bg-pure-black text-floral-white">
                  {sector.name} ({sector.symbol || 'N/A'})
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-xs text-error-red font-mono">
              {error}
            </p>
          )}

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-2xl border border-ink-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-floral-white/80 hover:bg-ink-800 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !prompt.trim()}
              className="rounded-2xl bg-sage-green px-5 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-pure-black hover:bg-sage-green/90 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Spinning…' : 'Spin Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


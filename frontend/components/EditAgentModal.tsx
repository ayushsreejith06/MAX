'use client';

import React, { useEffect, useState, FormEvent } from 'react';
import type { Agent, Sector } from '@/lib/types';
import { updateAgent, fetchSectors, fetchAgentById } from '@/lib/api';

interface EditAgentModalProps {
  isOpen: boolean;
  agent: Agent | null;
  onClose: () => void;
  onSuccess?: (agent: Agent) => void;
}

export function EditAgentModal({
  isOpen,
  agent,
  onClose,
  onSuccess,
}: EditAgentModalProps) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [prompt, setPrompt] = useState('');
  const [selectedSectorId, setSelectedSectorId] = useState<string>('unassigned');
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [isLoadingSectors, setIsLoadingSectors] = useState(false);
  const [isLoadingAgent, setIsLoadingAgent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullAgent, setFullAgent] = useState<Agent | null>(null);

  // Personality settings
  const [riskTolerance, setRiskTolerance] = useState<string>('medium');
  const [decisionStyle, setDecisionStyle] = useState<string>('balanced');

  // Preferences
  const [riskWeight, setRiskWeight] = useState<number>(0.5);
  const [profitWeight, setProfitWeight] = useState<number>(0.5);
  const [speedWeight, setSpeedWeight] = useState<number>(0.5);
  const [accuracyWeight, setAccuracyWeight] = useState<number>(0.5);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !agent) {
      setFullAgent(null);
      return;
    }

    const loadAgentData = async () => {
      setError(null);
      setIsLoadingAgent(true);

      try {
        // Fetch full agent details to ensure we have all fields (prompt, preferences, etc.)
        const fullAgentData = await fetchAgentById(agent.id);
        
        if (!fullAgentData) {
          setError('Agent not found. Please refresh and try again.');
          setIsLoadingAgent(false);
          return;
        }

        setFullAgent(fullAgentData);

        // Populate form fields with agent data
        setName(fullAgentData.name || '');
        setRole(fullAgentData.role || '');
        setPrompt(fullAgentData.prompt || '');
        setSelectedSectorId(fullAgentData.sectorId || 'unassigned');
        
        // Load personality settings (normalize to lowercase)
        if (fullAgentData.personality) {
          const riskTol = (fullAgentData.personality.riskTolerance || 'medium').toLowerCase();
          const decisionSty = (fullAgentData.personality.decisionStyle || 'balanced').toLowerCase();
          setRiskTolerance(riskTol === 'low' || riskTol === 'medium' || riskTol === 'high' ? riskTol : 'medium');
          setDecisionStyle(decisionSty === 'conservative' || decisionSty === 'balanced' || decisionSty === 'aggressive' ? decisionSty : 'balanced');
        } else {
          setRiskTolerance('medium');
          setDecisionStyle('balanced');
        }

        // Load preferences (if available)
        if (fullAgentData.preferences) {
          setRiskWeight(fullAgentData.preferences.riskWeight ?? 0.5);
          setProfitWeight(fullAgentData.preferences.profitWeight ?? 0.5);
          setSpeedWeight(fullAgentData.preferences.speedWeight ?? 0.5);
          setAccuracyWeight(fullAgentData.preferences.accuracyWeight ?? 0.5);
        } else {
          // Set defaults if preferences don't exist
          setRiskWeight(0.5);
          setProfitWeight(0.5);
          setSpeedWeight(0.5);
          setAccuracyWeight(0.5);
        }
      } catch (err) {
        console.error('Failed to load agent details', err);
        setError('Failed to load agent details. Please try again.');
        // Fallback to using the passed agent data
        setName(agent.name || '');
        setRole(agent.role || '');
        setPrompt((agent as any).prompt || '');
        setSelectedSectorId(agent.sectorId || 'unassigned');
        if (agent.personality) {
          const riskTol = (agent.personality.riskTolerance || 'medium').toLowerCase();
          const decisionSty = (agent.personality.decisionStyle || 'balanced').toLowerCase();
          setRiskTolerance(riskTol === 'low' || riskTol === 'medium' || riskTol === 'high' ? riskTol : 'medium');
          setDecisionStyle(decisionSty === 'conservative' || decisionSty === 'balanced' || decisionSty === 'aggressive' ? decisionSty : 'balanced');
        }
        if ((agent as any).preferences) {
          const prefs = (agent as any).preferences;
          setRiskWeight(prefs.riskWeight ?? 0.5);
          setProfitWeight(prefs.profitWeight ?? 0.5);
          setSpeedWeight(prefs.speedWeight ?? 0.5);
          setAccuracyWeight(prefs.accuracyWeight ?? 0.5);
        }
      } finally {
        setIsLoadingAgent(false);
      }
    };

    const loadSectors = async () => {
      try {
        setIsLoadingSectors(true);
        const data = await fetchSectors();
        setSectors(data);
      } catch (err) {
        console.error('Failed to load sectors', err);
        // Don't set error for sectors, just log it
      } finally {
        setIsLoadingSectors(false);
      }
    };

    void loadAgentData();
    void loadSectors();
  }, [isOpen, agent]);

  if (!isOpen || !agent) {
    return null;
  }

  // Show loading state while fetching agent details
  if (isLoadingAgent) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-pure-black/60 backdrop-blur-sm"
        onClick={handleBackdropClick}
      >
        <div className="w-full max-w-2xl rounded-3xl border border-ink-500 bg-card-bg/95 p-6 shadow-2xl">
          <div className="flex items-center justify-center py-12">
            <p className="text-floral-white/70 font-mono">Loading agent settings...</p>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!name.trim()) {
      setError('Name is required.');
      return;
    }

    if (!role.trim()) {
      setError('Role is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const sectorIdToSend = selectedSectorId === 'unassigned' ? null : selectedSectorId;

    try {
      const agentIdToUpdate = fullAgent?.id || agent.id;
      const updatedAgent = await updateAgent(agentIdToUpdate, {
        name: name.trim(),
        role: role.trim(),
        prompt: prompt.trim(),
        sectorId: sectorIdToSend,
        personality: {
          riskTolerance,
          decisionStyle,
        },
        preferences: {
          riskWeight,
          profitWeight,
          speedWeight,
          accuracyWeight,
        },
      });

      if (onSuccess) {
        onSuccess(updatedAgent);
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to update agent', err);
      setError(
        err?.message ?? 'Failed to update agent. Please try again.'
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-pure-black/60 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
      style={{ overscrollBehavior: 'contain' }}
    >
      <div 
        className="w-full max-w-2xl rounded-3xl border border-ink-500 bg-card-bg/95 shadow-2xl flex flex-col max-h-[calc(100vh-2rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-ink-500/50 flex-shrink-0">
          <h2 className="text-sm font-semibold uppercase tracking-[0.35em] text-floral-white">
            Customize Agent Settings
          </h2>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 min-h-0" style={{ overscrollBehavior: 'contain' }}>
          <form onSubmit={handleSubmit} className="space-y-4">
          {/* Basic Information */}
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.25em] text-floral-white/70">
                Agent Name
              </label>
              <input
                type="text"
                className="w-full rounded-2xl border border-ink-500 bg-pure-black/60 px-3 py-2 text-sm text-floral-white placeholder:text-floral-white/40 outline-none transition focus:border-sage-green focus:ring-2 focus:ring-sage-green/40"
                placeholder="Agent name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.25em] text-floral-white/70">
                Role
              </label>
              <input
                type="text"
                className="w-full rounded-2xl border border-ink-500 bg-pure-black/60 px-3 py-2 text-sm text-floral-white placeholder:text-floral-white/40 outline-none transition focus:border-sage-green focus:ring-2 focus:ring-sage-green/40"
                placeholder="e.g., trader, analyst, manager"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.25em] text-floral-white/70">
                Prompt
              </label>
              <textarea
                className="h-24 w-full rounded-2xl border border-ink-500 bg-pure-black/60 px-3 py-2 text-sm text-floral-white placeholder:text-floral-white/40 outline-none transition focus:border-sage-green focus:ring-2 focus:ring-sage-green/40"
                placeholder="Agent prompt/instructions"
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
          </div>

          {/* Personality Settings */}
          <div className="border-t border-ink-500/50 pt-4 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-floral-white/80">
              Personality
            </h3>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.25em] text-floral-white/70">
                Risk Tolerance
              </label>
              <select
                className="w-full rounded-2xl border border-ink-500 bg-pure-black/60 px-3 py-2 text-sm text-floral-white outline-none transition focus:border-sage-green focus:ring-2 focus:ring-sage-green/40"
                value={riskTolerance}
                onChange={(e) => setRiskTolerance(e.target.value)}
                disabled={isSubmitting}
              >
                <option value="low" className="bg-pure-black text-floral-white">Low</option>
                <option value="medium" className="bg-pure-black text-floral-white">Medium</option>
                <option value="high" className="bg-pure-black text-floral-white">High</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.25em] text-floral-white/70">
                Decision Style
              </label>
              <select
                className="w-full rounded-2xl border border-ink-500 bg-pure-black/60 px-3 py-2 text-sm text-floral-white outline-none transition focus:border-sage-green focus:ring-2 focus:ring-sage-green/40"
                value={decisionStyle}
                onChange={(e) => setDecisionStyle(e.target.value)}
                disabled={isSubmitting}
              >
                <option value="conservative" className="bg-pure-black text-floral-white">Conservative</option>
                <option value="balanced" className="bg-pure-black text-floral-white">Balanced</option>
                <option value="aggressive" className="bg-pure-black text-floral-white">Aggressive</option>
              </select>
            </div>
          </div>

          {/* Preferences */}
          <div className="border-t border-ink-500/50 pt-4 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-floral-white/80">
              Preferences (0.0 - 1.0)
            </h3>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.25em] text-floral-white/70">
                Risk Weight: {riskWeight.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={riskWeight}
                onChange={(e) => setRiskWeight(parseFloat(e.target.value))}
                disabled={isSubmitting}
                className="w-full"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.25em] text-floral-white/70">
                Profit Weight: {profitWeight.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={profitWeight}
                onChange={(e) => setProfitWeight(parseFloat(e.target.value))}
                disabled={isSubmitting}
                className="w-full"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.25em] text-floral-white/70">
                Speed Weight: {speedWeight.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={speedWeight}
                onChange={(e) => setSpeedWeight(parseFloat(e.target.value))}
                disabled={isSubmitting}
                className="w-full"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.25em] text-floral-white/70">
                Accuracy Weight: {accuracyWeight.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={accuracyWeight}
                onChange={(e) => setAccuracyWeight(parseFloat(e.target.value))}
                disabled={isSubmitting}
                className="w-full"
              />
            </div>
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
              disabled={isSubmitting || !name.trim() || !role.trim()}
              className="rounded-2xl bg-sage-green px-5 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-pure-black hover:bg-sage-green/90 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}


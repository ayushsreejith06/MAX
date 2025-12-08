'use client';

import React, { useEffect, useState, FormEvent, useRef } from 'react';
import type { Sector } from '@/lib/types';
import { sendMessageToManager } from '@/lib/api';

interface SectorSettingsFormProps {
  sector: Sector;
  onClose: () => void;
  onSuccess?: () => void;
}

export function SectorSettingsForm({
  sector,
  onClose,
  onSuccess,
}: SectorSettingsFormProps) {
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Don't close if clicking on the Settings button or its children
      if (target.closest('button[title="Sector settings"]')) {
        return;
      }
      if (formRef.current && !formRef.current.contains(target)) {
        onClose();
      }
    };

    // Add event listener after a short delay to avoid immediate close
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!message.trim()) {
      setError('Message is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await sendMessageToManager(sector.id, message.trim());
      setSuccess('Message sent successfully to manager agent.');
      setMessage('');
      
      // Call onSuccess callback if provided
      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 1000);
      }
    } catch (err: any) {
      console.error('Failed to send message to manager', err);
      setError(
        err?.message ?? 'Failed to send message to manager. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Find manager agent for this sector
  const managerAgent = sector.agents?.find(
    agent => agent.role === 'manager' || agent.role?.toLowerCase().includes('manager')
  );

  return (
    <div ref={formRef} className="rounded-2xl border border-ink-500 bg-pure-black/60 p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs uppercase tracking-[0.4em] text-floral-white/50">Sector Settings</p>
        <button
          onClick={onClose}
          className="text-xs uppercase tracking-[0.2em] text-floral-white/60 hover:text-floral-white transition-colors"
        >
          ✕ Close
        </button>
      </div>

      <div className="mb-4 pb-4 border-b border-ink-500/50">
        <p className="text-sm text-floral-white/80 font-mono mb-2">
          <span className="text-floral-white/50">Sector:</span> {sector.name} ({sector.symbol})
        </p>
        {managerAgent ? (
          <p className="text-sm text-floral-white/80 font-mono">
            <span className="text-floral-white/50">Manager Agent:</span> {managerAgent.name}
          </p>
        ) : (
          <p className="text-sm text-warning-amber font-mono">
            No manager agent found for this sector
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-[0.25em] text-floral-white/70">
            Message to Manager Agent
          </label>
          <textarea
            className="h-32 w-full rounded-2xl border border-ink-500 bg-pure-black/60 px-3 py-2 text-sm text-floral-white placeholder:text-floral-white/40 outline-none transition focus:border-sage-green focus:ring-2 focus:ring-sage-green/40"
            placeholder="Enter your instructions or changes you want applied to this sector. The manager agent will review and apply them accordingly."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={isSubmitting || !managerAgent}
          />
          <p className="mt-1 text-xs text-floral-white/50 font-mono">
            Describe changes you want the manager agent to apply to this sector (e.g., risk tolerance, strategy adjustments, agent configurations).
          </p>
        </div>

        {error && (
          <p className="text-xs text-error-red font-mono">
            {error}
          </p>
        )}

        {success && (
          <p className="text-xs text-sage-green font-mono">
            {success}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-ink-500/50">
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
            disabled={isSubmitting || !message.trim() || !managerAgent}
            className="rounded-2xl bg-sage-green px-5 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-pure-black hover:bg-sage-green/90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Sending…' : 'Send Message'}
          </button>
        </div>
      </form>
    </div>
  );
}


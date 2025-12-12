'use client';

import React, { useState } from 'react';
import ExecutedDecisionsTab from './decision-logs/ExecutedDecisionsTab';
import FinalizedRejectionsTab from './decision-logs/FinalizedRejectionsTab';
import { clearDecisionLogs } from '@/lib/api';
import { useToast, ToastContainer } from '@/components/Toast';

type TabType = 'executed' | 'rejections';

export default function DecisionLogsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('executed');
  const [refreshKey, setRefreshKey] = useState(0);
  const [clearing, setClearing] = useState(false);
  const { toasts, showToast, closeToast } = useToast();

  const handleClearDecisionLogs = async () => {
    try {
      setClearing(true);
      await clearDecisionLogs();
      showToast('Decision logs cleared successfully', 'success');
      // Trigger refresh by incrementing key
      setRefreshKey(prev => prev + 1);
    } catch (error: any) {
      showToast(error?.message || 'Failed to clear decision logs', 'error');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="min-h-screen bg-pure-black p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-floral-white">Decision Logs</h1>
          <button
            onClick={handleClearDecisionLogs}
            disabled={clearing}
            className="px-4 py-2 bg-error-red text-floral-white border border-error-red rounded-lg hover:bg-error-red/80 transition-colors text-sm font-mono disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {clearing ? 'Clearing...' : 'Clear Decision Logs'}
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab('executed')}
            className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide border rounded-lg transition-all ${
              activeTab === 'executed'
                ? 'bg-sage-green text-pure-black border-sage-green shadow-[0_0_20px_rgba(20,177,22,0.35)]'
                : 'bg-ink-600 text-floral-white/70 border-floral-white/10 hover:text-floral-white'
            }`}
          >
            Decisions
          </button>
          <button
            onClick={() => setActiveTab('rejections')}
            className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide border rounded-lg transition-all ${
              activeTab === 'rejections'
                ? 'bg-sage-green text-pure-black border-sage-green shadow-[0_0_20px_rgba(20,177,22,0.35)]'
                : 'bg-ink-600 text-floral-white/70 border-floral-white/10 hover:text-floral-white'
            }`}
          >
            Rejections
          </button>
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === 'executed' && <ExecutedDecisionsTab refreshTrigger={refreshKey} />}
          {activeTab === 'rejections' && <FinalizedRejectionsTab refreshTrigger={refreshKey} />}
        </div>
      </div>
      <ToastContainer toasts={toasts} onClose={closeToast} />
    </div>
  );
}


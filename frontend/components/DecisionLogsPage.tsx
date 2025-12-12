'use client';

import React, { useState } from 'react';
import ExecutedDecisionsTab from './decision-logs/ExecutedDecisionsTab';
import FinalizedRejectionsTab from './decision-logs/FinalizedRejectionsTab';

type TabType = 'executed' | 'rejections';

export default function DecisionLogsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('executed');

  return (
    <div className="min-h-screen bg-pure-black p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-floral-white mb-8">Decision Logs</h1>

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
          {activeTab === 'executed' && <ExecutedDecisionsTab />}
          {activeTab === 'rejections' && <FinalizedRejectionsTab />}
        </div>
      </div>
    </div>
  );
}


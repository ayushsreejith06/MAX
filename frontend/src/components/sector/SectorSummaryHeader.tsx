'use client';

import type { Sector } from '@/src/lib/types';

interface SectorSummaryHeaderProps {
  sector: Sector;
}

export default function SectorSummaryHeader({ sector }: SectorSummaryHeaderProps) {
  const isPositive = sector.changePercent >= 0;
  const changeColor = isPositive ? 'text-green-400' : 'text-red-400';
  const changeBg = isPositive ? 'bg-green-500/10' : 'bg-red-500/10';
  const changeBorder = isPositive ? 'border-green-500/30' : 'border-red-500/30';

  return (
    <div className="bg-gray-800 rounded-lg p-6 mb-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Left: Name and Description */}
        <div className="flex-1">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            {sector.name}
          </h1>
          <p className="text-gray-400 text-sm md:text-base">
            {sector.symbol} • Sector Overview
          </p>
          {sector.createdAt && (
            <p className="text-gray-400 mt-2 text-xs">
              Created: {new Date(sector.createdAt).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Right: Price and Change */}
        <div className="flex flex-col md:items-end gap-3">
          <div className="text-right">
            <p className="text-2xl md:text-3xl font-bold text-white">
              ${sector.currentPrice.toFixed(2)}
            </p>
            <p className="text-sm text-gray-400 mt-1">Current Price</p>
          </div>
          <div
            className={`px-4 py-2 rounded-lg border ${changeBg} ${changeBorder} ${changeColor}`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">
                {isPositive ? '+' : ''}
                {sector.changePercent.toFixed(2)}%
              </span>
              <span className="text-sm">
                ({isPositive ? '+' : ''}
                {sector.change.toFixed(2)})
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


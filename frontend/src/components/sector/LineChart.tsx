'use client';

import { useMemo } from 'react';
import type { CandlePoint } from '@/src/lib/types';

interface LineChartProps {
  data: CandlePoint[];
  height?: number;
  color?: string;
  showGrid?: boolean;
}

export default function LineChart({
  data,
  height = 300,
  color = '#7FB069',
  showGrid = true,
}: LineChartProps) {
  const { path, minValue, maxValue, width } = useMemo(() => {
    if (!data || data.length === 0) {
      return { path: '', minValue: 0, maxValue: 100, width: 800 };
    }

    const values = data.map((point) => point.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const valueRange = maxValue - minValue || 1; // Avoid division by zero
    const padding = 20;
    const chartWidth = 800;
    const chartHeight = height - padding * 2;

    // Build SVG path
    const points = data.map((point, index) => {
      const x = padding + (index / (data.length - 1 || 1)) * (chartWidth - padding * 2);
      const y =
        padding +
        chartHeight -
        ((point.value - minValue) / valueRange) * chartHeight;
      return `${x},${y}`;
    });

    const pathData = points.join(' L ');

    return {
      path: `M ${pathData}`,
      minValue,
      maxValue,
      width: chartWidth,
    };
  }, [data, height]);

  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-card rounded-lg border border-card"
        style={{ height }}
      >
        <p className="text-gray-400">No chart data available</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-card rounded-lg p-4 shadow-dark-md">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
      >
        {/* Grid lines */}
        {showGrid && (
          <g stroke="#262730" strokeWidth="1" strokeDasharray="2,2">
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = 20 + (height - 40) * (1 - ratio);
              return (
                <line
                  key={ratio}
                  x1="20"
                  y1={y}
                  x2={width - 20}
                  y2={y}
                />
              );
            })}
          </g>
        )}

        {/* Area fill */}
        <defs>
          <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path
          d={`${path} L ${width - 20},${height - 20} L 20,${height - 20} Z`}
          fill="url(#areaGradient)"
        />

        {/* Line */}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {data.map((point, index) => {
          const x = padding + (index / (data.length - 1 || 1)) * (width - padding * 2);
          const y =
            padding +
            (height - padding * 2) -
            ((point.value - minValue) / (maxValue - minValue || 1)) * (height - padding * 2);
          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r="4"
              fill="#FFF8F0"
              stroke={color}
              strokeWidth="2"
            />
          );
        })}

        {/* Value labels */}
        <g fill="#FFF8F0" fontSize="10" textAnchor="end" opacity="0.6">
          <text x={width - 25} y="15">
            {maxValue.toFixed(2)}
          </text>
          <text x={width - 25} y={height - 5}>
            {minValue.toFixed(2)}
          </text>
        </g>
      </svg>
    </div>
  );
}


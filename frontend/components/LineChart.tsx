'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { TooltipProps } from 'recharts';
import { Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import { CandleData } from '@/lib/types';

interface LineChartProps {
  data: CandleData[];
  sectorName: string;
  sectorSymbol: string;
  initialWindowHours?: number;
  initialTickIncrement?: number;
}

const CustomDot = ({ cx, cy }: { cx?: number; cy?: number }) => {
  if (cx === undefined || cy === undefined) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill="#FFFFFF"
      stroke="#171717"
      strokeWidth={1.5}
    />
  );
};

const LineChart = React.memo(function LineChart({
  data,
  sectorName,
  sectorSymbol,
  initialWindowHours = 2,
  initialTickIncrement = 10,
}: LineChartProps) {
  const [tickIncrement, setTickIncrement] = useState<number>(initialTickIncrement); // minutes per tick
  const [windowSizeHours, setWindowSizeHours] = useState<number>(initialWindowHours); // hours in window
  const [windowIndex, setWindowIndex] = useState<number>(0);
  const [showMarkers, setShowMarkers] = useState<boolean>(true);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  const isMarketIndex = sectorName === 'Market Index';

  useEffect(() => {
    // Only update if prop actually changed to prevent loops
    if (tickIncrement !== initialTickIncrement) {
      setTickIncrement(initialTickIncrement);
    }
  }, [initialTickIncrement]); // Remove tickIncrement and sectorName from deps to prevent loops

  useEffect(() => {
    // Only update if prop actually changed to prevent loops
    if (windowSizeHours !== initialWindowHours) {
      setWindowSizeHours(initialWindowHours);
    }
  }, [initialWindowHours]); // Remove windowSizeHours and sectorName from deps to prevent loops

  useEffect(() => {
    setWindowIndex(0);
  }, [tickIncrement, windowSizeHours, sectorName, sectorSymbol]);

  // Convert time string to minutes since midnight or timestamp for dates
  const timeToMinutes = (time: string): number => {
    // Check if it's a date format (MM/DD or YYYY-MM-DD)
    if (time.includes('/')) {
      const parts = time.split('/');
      if (parts.length === 2) {
        // MM/DD format - use as sortable value (month * 100 + day)
        const month = parseInt(parts[0], 10);
        const day = parseInt(parts[1], 10);
        return month * 100 + day;
      }
    }
    // Time format (HH:MM)
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Filter data based on tick increment
  const filteredData = useMemo(() => {
    if (!data.length) return [];
    if (tickIncrement <= 5) return data;

    return data.filter(point => {
      const minutes = timeToMinutes(point.time);
      return minutes % tickIncrement === 0;
    });
  }, [data, tickIncrement]);

  // Calculate windowed data
  const windowedData = useMemo(() => {
    if (!filteredData.length) {
      return { data: [], startTime: '00:00', endTime: '00:00', totalWindows: 1 };
    }

    const minutes = filteredData.map(point => timeToMinutes(point.time));
    const minMinutes = Math.min(...minutes);
    const maxMinutes = Math.max(...minutes);
    const windowSizeMinutes = Math.max(windowSizeHours, 1) * 60;
    const totalSpan = Math.max(windowSizeMinutes, maxMinutes - minMinutes + tickIncrement);
    const totalWindows = Math.max(1, Math.ceil(totalSpan / windowSizeMinutes));
    const clampedIndex = Math.min(windowIndex, totalWindows - 1);
    const startMinutes = minMinutes + clampedIndex * windowSizeMinutes;
    const endMinutes = startMinutes + windowSizeMinutes;

    const windowed = filteredData.filter(point => {
      const value = timeToMinutes(point.time);
      return value >= startMinutes && value < endMinutes;
    });

    const dataSubset = windowed.length ? windowed : filteredData.slice(-Math.ceil(windowSizeMinutes / Math.max(tickIncrement, 1)));
    const startTime = dataSubset[0]?.time ?? filteredData[0].time;
    const endTime = dataSubset[dataSubset.length - 1]?.time ?? filteredData[filteredData.length - 1].time;

    return {
      data: dataSubset,
      startTime,
      endTime,
      totalWindows,
    };
  }, [filteredData, windowSizeHours, windowIndex, tickIncrement]);

  useEffect(() => {
    setWindowIndex(prev => {
      const maxIndex = Math.max(windowedData.totalWindows - 1, 0);
      return Math.min(prev, maxIndex);
    });
  }, [windowedData.totalWindows]);

  const handlePrevious = () => {
    setWindowIndex(prev => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setWindowIndex(prev => Math.min(windowedData.totalWindows - 1, prev + 1));
  };

  const tickIncrementOptions = [5, 10, 15, 30, 60];
  const windowSizeOptions = [1, 2, 4, 6, 12, 24];
  const chartData = useMemo(() => {
    const subset = windowedData.data.length ? windowedData.data : filteredData;
    if (!subset.length) {
      return [];
    }
    const byTime = new Map<string, CandleData>();
    subset.forEach(point => {
      byTime.set(point.time, point);
    });
    return Array.from(byTime.entries())
      .sort((a, b) => timeToMinutes(a[0]) - timeToMinutes(b[0]))
      .map(([, point]) => point);
  }, [windowedData.data, filteredData]);

  // Calculate Y-axis domain based on data range for better scaling
  // This ensures even small price movements are visible
  const yAxisDomain = useMemo(() => {
    if (!chartData.length) {
      return [0, 10];
    }

    const values = chartData.map(point => point.value).filter(v => Number.isFinite(v));
    if (values.length === 0) {
      return [0, 10];
    }

    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const dataRange = dataMax - dataMin;
    const dataCenter = (dataMin + dataMax) / 2;

    // If all values are the same, create a visible range around that value
    if (dataRange === 0) {
      const center = dataMin;
      // Use 1% of the center value as padding to show small movements
      const padding = Math.max(center * 0.01, Math.max(center * 0.005, 0.01));
      return [center - padding, center + padding];
    }

    // For small ranges, amplify the visual range to make changes visible
    // Use a minimum range of 1% of the center value to ensure visibility
    const minVisualRange = Math.max(dataCenter * 0.01, dataRange * 2);
    const actualRange = Math.max(dataRange, minVisualRange);
    
    // Add 10% padding above and below for better visualization
    const padding = actualRange * 0.1;
    const min = Math.max(0, dataCenter - (actualRange / 2) - padding);
    const max = dataCenter + (actualRange / 2) + padding;

    return [min, max];
  }, [chartData]);

  // Calculate X-axis interval to show approximately 8-10 ticks
  const xAxisInterval = useMemo(() => {
    if (!chartData.length) return 0;
    if (chartData.length <= 10) return 0; // Show all ticks if 10 or fewer
    // Show approximately 8 ticks by skipping the right number
    return Math.floor(chartData.length / 8);
  }, [chartData]);

  const { chartSeries, trendMap } = useMemo(() => {
    type TrendPoint = CandleData & {
      riseValue: number | null;
      fallValue: number | null;
    };

    const series: TrendPoint[] = chartData.map(point => ({
      ...point,
      riseValue: null,
      fallValue: null,
    }));
    const trend = new Map<string, 'up' | 'down' | 'flat'>();

    if (series.length) {
      trend.set(series[0].time, 'flat');
    }

    for (let index = 1; index < series.length; index++) {
      const prev = series[index - 1];
      const curr = series[index];
      if (!Number.isFinite(prev.value) || !Number.isFinite(curr.value)) {
        continue;
      }

      if (curr.value > prev.value) {
        prev.riseValue = prev.value;
        curr.riseValue = curr.value;
        trend.set(curr.time, 'up');
      } else if (curr.value < prev.value) {
        prev.fallValue = prev.value;
        curr.fallValue = curr.value;
        trend.set(curr.time, 'down');
      } else {
        trend.set(curr.time, 'flat');
      }
    }

    return { chartSeries: series, trendMap: trend };
  }, [chartData]);

  const CustomTooltipContent = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) {
      return null;
    }

    const point = payload[0]?.payload as CandleData | undefined;
    if (!point) {
      return null;
    }

    const trend = trendMap.get(label as string) ?? 'flat';
    const trendColor =
      trend === 'up' ? '#14B116' : trend === 'down' ? '#BD0000' : '#EDEDED';

    // Calculate change from first point if available
    const firstValue = chartSeries.length > 0 ? chartSeries[0]?.value : undefined;
    const change = firstValue ? point.value - firstValue : 0;
    const changePercent = firstValue ? (change / firstValue) * 100 : 0;

    return (
      <div className="rounded-xl border border-ink-500 bg-pure-black/95 backdrop-blur-sm px-4 py-3 shadow-2xl">
        <p className="text-[0.65rem] font-mono uppercase tracking-[0.3em] text-floral-white/60 mb-2">{label}</p>
        <div className="space-y-1">
          <p className="text-lg font-bold font-mono" style={{ color: trendColor }}>
            {sectorSymbol}: ${point.value.toFixed(2)}
          </p>
          {firstValue !== undefined && (
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-floral-white/60">Change:</span>
              <span style={{ color: change >= 0 ? '#14B116' : '#BD0000' }}>
                {change >= 0 ? '+' : ''}${change.toFixed(2)} ({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full">
      <div className="flex justify-end mb-4">
        <div className="relative">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-full border transition-colors ${
              showSettings
                ? 'border-sage-green bg-sage-green/30 shadow-[0_0_20px_rgba(127,176,105,0.45)]'
                : 'border-sage-green/50 bg-transparent hover:bg-sage-green/10'
            }`}
            aria-label="Toggle chart settings"
          >
            <Settings className="w-4 h-4 text-sage-green" />
          </button>

          {showSettings && (
            <div className="absolute right-0 top-full mt-3 w-72 rounded-2xl border border-sage-green/40 bg-pure-black p-4 shadow-2xl backdrop-blur z-20">
              <div className="space-y-4 text-sage-green">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-sage-green/80">Time Increment</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {tickIncrementOptions.map(inc => (
                      <button
                        key={inc}
                        onClick={() => setTickIncrement(inc)}
                        className={`px-3 py-1.5 rounded-full text-xs font-mono transition-all ${
                          tickIncrement === inc
                            ? 'bg-sage-green text-pure-black shadow-[0_0_15px_rgba(127,176,105,0.45)]'
                            : 'border border-sage-green/30 text-sage-green hover:bg-sage-green/10'
                        }`}
                      >
                        {inc}m
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-sage-green/80">Window Size</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {windowSizeOptions.map(win => (
                      <button
                        key={win}
                        onClick={() => setWindowSizeHours(win)}
                        className={`px-3 py-1.5 rounded-full text-xs font-mono transition-all ${
                          windowSizeHours === win
                            ? 'bg-sage-green text-pure-black shadow-[0_0_15px_rgba(127,176,105,0.45)]'
                            : 'border border-sage-green/30 text-sage-green hover:bg-sage-green/10'
                        }`}
                      >
                        {win}h
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span>Markers</span>
                  <button
                    onClick={() => setShowMarkers(prev => !prev)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                      showMarkers ? 'bg-sage-green text-pure-black' : 'border border-sage-green/30 text-sage-green hover:bg-sage-green/10'
                    }`}
                  >
                    {showMarkers ? 'Visible' : 'Hidden'}
                  </button>
                </div>

                <button
                  onClick={() => {
                    setTickIncrement(10);
                    setWindowSizeHours(2);
                    setShowMarkers(true);
                  }}
                  className="w-full rounded-full border border-sage-green/40 bg-transparent px-3 py-2 text-xs font-semibold uppercase tracking-wider text-sage-green hover:bg-sage-green/10 transition-colors"
                >
                  Reset Defaults
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="relative rounded-2xl border border-ink-500 bg-card-bg/70 p-4">
        <ResponsiveContainer width="100%" height={420}>
          <RechartsLineChart data={chartSeries} margin={{ top: 10, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2D2D2D" />
            <XAxis
              dataKey="time"
              stroke="#EDEDED"
              style={{ fontSize: '12px', fontFamily: 'IBM Plex Mono, monospace' }}
              tick={{ fill: '#EDEDED' }}
              interval={xAxisInterval}
              minTickGap={20}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis
              stroke="#EDEDED"
              style={{ fontSize: '12px', fontFamily: 'IBM Plex Mono, monospace' }}
              tick={{ fill: '#EDEDED' }}
              domain={yAxisDomain}
              tickFormatter={(value) => (isMarketIndex ? `$${value.toFixed(2)}` : value.toFixed(2))}
            />
            <Tooltip
              content={<CustomTooltipContent />}
              cursor={{ stroke: '#EDEDED', strokeDasharray: '3 3' }}
            />
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#14B116" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#14B116" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="priceLineGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#14B116" />
                <stop offset="100%" stopColor="#7FB069" />
              </linearGradient>
            </defs>
            {/* Area fill for price line */}
            <Line
              type="monotone"
              dataKey="value"
              stroke="url(#priceLineGradient)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{
                r: 6,
                fill: '#FFFFFF',
                stroke: '#14B116',
                strokeWidth: 2,
                style: { filter: 'drop-shadow(0 0 4px rgba(20, 177, 22, 0.6))' }
              }}
              connectNulls
              isAnimationActive={false}
            />
            {/* Rise segments */}
            <Line
              type="monotone"
              dataKey="riseValue"
              stroke="#14B116"
              strokeWidth={3}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            {/* Fall segments */}
            <Line
              type="monotone"
              dataKey="fallValue"
              stroke="#BD0000"
              strokeWidth={3}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            {/* Base line for context */}
            <Line
              type="monotone"
              dataKey="value"
              stroke="#F5F5F540"
              strokeWidth={1.5}
              dot={showMarkers ? <CustomDot /> : false}
              connectNulls
              isAnimationActive={false}
            />
          </RechartsLineChart>
        </ResponsiveContainer>

        {windowedData.totalWindows > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-ink-500 bg-ink-600/40 px-4 py-3 mt-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-floral-white/60">Window</p>
              <p className="text-sm font-semibold text-floral-white">
                {windowIndex + 1} / {windowedData.totalWindows}
              </p>
            </div>

            <div className="text-sm text-floral-white/70 font-mono">
              {windowedData.startTime} - {windowedData.endTime}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevious}
                disabled={windowIndex === 0}
                className="p-2 rounded-full border border-ink-500 hover:border-sage-green disabled:opacity-40 disabled:cursor-not-allowed transition-colors bg-card-bg/70"
                aria-label="Previous window"
              >
                <ChevronLeft className="w-4 h-4 text-floral-white" />
              </button>
              <button
                onClick={handleNext}
                disabled={windowIndex >= windowedData.totalWindows - 1}
                className="p-2 rounded-full border border-ink-500 hover:border-sage-green disabled:opacity-40 disabled:cursor-not-allowed transition-colors bg-card-bg/70"
                aria-label="Next window"
              >
                <ChevronRight className="w-4 h-4 text-floral-white" />
              </button>
            </div>
          </div>
        )}

        {!chartData.length && (
          <div className="absolute inset-0 flex items-center justify-center text-floral-white/40 text-sm font-mono">
            No datapoints available
          </div>
        )}
      </div>
    </div>
  );
});

export default LineChart;

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

  // Convert time string to minutes since midnight
  const timeToMinutes = (time: string): number => {
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

    return (
      <div className="rounded-2xl border border-ink-500 bg-card-bg px-3 py-2 shadow-xl">
        <p className="text-[0.65rem] font-mono uppercase tracking-[0.3em] text-floral-white/60">{label}</p>
        <p className="text-sm font-mono" style={{ color: trendColor }}>
          {sectorSymbol} : ${point.value.toFixed(2)}
        </p>
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
          <RechartsLineChart data={chartSeries} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2D2D2D" />
            <XAxis
              dataKey="time"
              stroke="#EDEDED"
              style={{ fontSize: '12px', fontFamily: 'IBM Plex Mono, monospace' }}
              tick={{ fill: '#EDEDED' }}
            />
            <YAxis
              stroke="#EDEDED"
              style={{ fontSize: '12px', fontFamily: 'IBM Plex Mono, monospace' }}
              tick={{ fill: '#EDEDED' }}
              domain={[
                (dataMin: number) => (Number.isFinite(dataMin) ? Math.floor(dataMin - 10) : 0),
                (dataMax: number) => (Number.isFinite(dataMax) ? Math.ceil(dataMax + 10) : 10),
              ]}
              tickFormatter={(value) => (isMarketIndex ? `$${value.toFixed(2)}` : value.toFixed(2))}
            />
            <Tooltip
              content={<CustomTooltipContent />}
              cursor={{ stroke: '#EDEDED', strokeDasharray: '3 3' }}
            />
            <Line
              type="linear"
              dataKey="value"
              stroke="#F5F5F580"
              strokeWidth={2}
              dot={showMarkers ? <CustomDot /> : false}
              activeDot={
                showMarkers
                  ? { r: 6, fill: '#FFFFFF', stroke: '#171717', strokeWidth: 1.5 }
                  : false
              }
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="riseValue"
              stroke="#14B116"
              strokeWidth={2.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="fallValue"
              stroke="#BD0000"
              strokeWidth={2.5}
              dot={false}
              connectNulls={false}
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

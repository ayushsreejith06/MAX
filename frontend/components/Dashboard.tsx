'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { fetchSectors } from '@/lib/api';
import { fetchContractEvents } from '@/lib/mnee';
import type { CandleData, Sector } from '@/lib/types';
import { ChevronLeft, ChevronRight, Download, RefreshCcw, ChevronDown, Plus, X, Link as LinkIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import LineChart from './LineChart';

type TimeframeKey = '1H' | '4H' | '12H' | '24H';
type TableViewFilter = 'all' | 'gainers' | 'decliners';
type SortKey = 'volume' | 'price' | 'agents' | 'status';

interface ControlOption<T extends string> {
  value: T;
  label: string;
}

const timeframeOrder: TimeframeKey[] = ['1H', '4H', '12H', '24H'];

const timeframePresets: Record<TimeframeKey, { label: TimeframeKey; window: number; increment: number }> = {
  '1H': { label: '1H', window: 1, increment: 5 },
  '4H': { label: '4H', window: 4, increment: 10 },
  '12H': { label: '12H', window: 12, increment: 15 },
  '24H': { label: '24H', window: 24, increment: 30 },
};

// Removed timeframeProfiles - no longer using mock data transformations

function ControlSelect<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: ControlOption<T>[]; onChange: (value: T) => void }) {
  return (
    <label className="flex flex-col gap-2 text-floral-white/80 text-xs uppercase tracking-[0.3em]">
      <span>{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className="appearance-none w-44 rounded-xl border border-ink-500 bg-ink-600/70 px-4 py-2 pr-10 text-sm normal-case tracking-normal text-floral-white focus:outline-none focus:border-sage-green focus:ring-1 focus:ring-sage-green transition-colors"
        >
          {options.map(option => (
            <option key={option.value} value={option.value} className="bg-ink-600 text-floral-white">
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sage-green" />
      </div>
    </label>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [marketIndexView, setMarketIndexView] = useState<'overview' | number>('overview'); // 'overview' or sector index
  const [sectorTablePage, setSectorTablePage] = useState(0);
  const [selectedTimeframe, setSelectedTimeframe] = useState<TimeframeKey>('4H');
  const [tableView, setTableView] = useState<TableViewFilter>('all');
  const [sortOption, setSortOption] = useState<SortKey>('volume');
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [exportScope, setExportScope] = useState<'window' | 'all' | 'focused'>('window');
  const [exportDetailLevel, setExportDetailLevel] = useState<'summary' | 'full' | 'deep'>('full');
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const exportOptionsRef = useRef<HTMLDivElement | null>(null);
  const [selectedChartSectors, setSelectedChartSectors] = useState<string[]>([]);
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());
  const [contractCounts, setContractCounts] = useState({ sectors: 0, agents: 0, trades: 0 });
  const itemsPerPage = 6;
  const sectorsById = useMemo(() => {
    const map = new Map<string, Sector>();
    sectors.forEach(sector => map.set(sector.id, sector));
    return map;
  }, [sectors]);

  const loadSectors = useCallback(
    async (showSpinner = false) => {
      try {
        if (showSpinner) {
          setLoading(true);
        }
        setIsSyncing(true);
        const data = await fetchSectors();
        setSectors(data);
        setError(null);
        setLastUpdated(new Date());
      } catch (err: any) {
        console.error('Failed to fetch sectors', err);
        // Show the actual error message if available, otherwise show generic message
        const errorMessage = err?.message || 'Unable to load sectors. Please try again.';
        setError(errorMessage);
      } finally {
        setLoading(false);
        setIsSyncing(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadSectors(true);
  }, [loadSectors]);

  /**
   * Load contract activity counts for the On-Chain Activity card
   */
  useEffect(() => {
    const loadContractCounts = async () => {
      try {
        const response = await fetchContractEvents();
        if (response.success && response.counts) {
          setContractCounts(response.counts);
        }
      } catch (error) {
        // Silently fail - contract may not be configured
        console.debug('Could not load contract counts:', error);
      }
    };
    loadContractCounts();
    // Refresh every 30 seconds
    const interval = setInterval(loadContractCounts, 30000);
    return () => clearInterval(interval);
  }, []);


  // All hooks must be called before any early returns
  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Use actual sector data - no mock transformations
  const adjustedSectors = useMemo(() => {
    return sectors; // Return sectors as-is, no mock data transformations
  }, [sectors]);

  const aggregatedOverview = useMemo(() => {
    if (!adjustedSectors.length) {
      return { marketIndex: 0, marketIndexChange: 0, totalVolume: 0, totalAgents: 0, activeAgents: 0 };
    }

    const totalVolume = adjustedSectors.reduce((sum, sector) => sum + sector.volume, 0);
    const totalAgents = adjustedSectors.reduce((sum, sector) => sum + sector.agents.length, 0);
    const activeAgents = adjustedSectors.reduce((sum, sector) => sum + sector.activeAgents, 0);
    const averagePrice = adjustedSectors.reduce((sum, sector) => sum + sector.currentPrice, 0) / adjustedSectors.length;
    const averageChangePercent = adjustedSectors.reduce((sum, sector) => sum + sector.changePercent, 0) / adjustedSectors.length;

    return {
      marketIndex: Number((averagePrice * 6.93).toFixed(2)),
      marketIndexChange: Number(averageChangePercent.toFixed(2)),
      totalVolume,
      totalAgents,
      activeAgents,
    };
  }, [adjustedSectors]);

  const { marketIndex, marketIndexChange, totalVolume, totalAgents, activeAgents } = aggregatedOverview;
  const utilizationPercent = totalAgents > 0 ? ((activeAgents / totalAgents) * 100).toFixed(1) : '0';

  const selectedSector = useMemo(() => {
    return typeof marketIndexView === 'number' ? adjustedSectors[marketIndexView] : null;
  }, [marketIndexView, adjustedSectors]);
  const displayedIndexValue = selectedSector ? selectedSector.currentPrice : marketIndex;
  const displayedChangePercent = selectedSector ? selectedSector.changePercent : marketIndexChange;
  const changeAccentClass = displayedChangePercent >= 0 ? 'text-sage-green' : 'text-error-red';
  const sectorUtilizationPercent = selectedSector
    ? ((selectedSector.activeAgents / Math.max(selectedSector.agents.length, 1)) * 100).toFixed(1)
    : null;
  const cardSummaries = {
    volumeValue: selectedSector ? selectedSector.volume : totalVolume,
    volumeSubtitle: selectedSector ? `${selectedSector.name} sector` : `Across ${adjustedSectors.length} sectors`,
    totalAgentsValue: selectedSector ? selectedSector.agents.length : totalAgents,
    totalAgentsSubtitle: selectedSector
      ? `${selectedSector.name} team`
      : `Across ${adjustedSectors.length} sectors`,
    activeAgentsValue: selectedSector ? selectedSector.activeAgents : activeAgents,
    activeAgentsSubtitle: selectedSector
      ? `${sectorUtilizationPercent}% utilization`
      : `${utilizationPercent}% utilization`,
  };
  const currentViewLabel =
    marketIndexView === 'overview'
      ? 'All Sectors'
      : `${selectedSector?.name ?? 'Sector'} • ${selectedSector?.symbol ?? ''}`;

  const filteredSectors = useMemo(() => {
    let dataset = [...adjustedSectors];

    if (tableView === 'gainers') {
      dataset = dataset.filter(sector => sector.changePercent >= 0);
    } else if (tableView === 'decliners') {
      dataset = dataset.filter(sector => sector.changePercent < 0);
    }

    switch (sortOption) {
      case 'price':
        dataset.sort((a, b) => b.currentPrice - a.currentPrice);
        break;
      case 'agents':
        dataset.sort((a, b) => b.activeAgents - a.activeAgents);
        break;
      case 'status':
        dataset.sort((a, b) => b.statusPercent - a.statusPercent);
        break;
      default:
        dataset.sort((a, b) => b.volume - a.volume);
    }

    return dataset;
  }, [adjustedSectors, tableView, sortOption]);

  const totalPages = Math.max(1, Math.ceil(filteredSectors.length / itemsPerPage));

  const paginatedSectors = useMemo(() => {
    const start = sectorTablePage * itemsPerPage;
    return filteredSectors.slice(start, start + itemsPerPage);
  }, [filteredSectors, sectorTablePage]);

  const currentRangeStart = filteredSectors.length ? sectorTablePage * itemsPerPage + 1 : 0;
  const currentRangeEnd = filteredSectors.length ? Math.min(filteredSectors.length, (sectorTablePage + 1) * itemsPerPage) : 0;
  const canGoPrevPage = sectorTablePage > 0;
  const canGoNextPage = sectorTablePage < totalPages - 1;

  const aggregatedChartData = useMemo<CandleData[]>(() => {
    if (!selectedChartSectors.length) {
      return [];
    }

    if (selectedChartSectors.length === 1) {
      const only = sectorsById.get(selectedChartSectors[0]);
      return only?.candleData ?? [];
    }

    const totals = new Map<string, number>();
    selectedChartSectors.forEach(sectorId => {
      const baseSector = sectorsById.get(sectorId);
      if (!baseSector?.candleData.length) {
        return;
      }
      const baseline = baseSector.candleData[0].value;
      baseSector.candleData.forEach(point => {
        const delta = point.value - baseline;
        totals.set(point.time, Number(((totals.get(point.time) ?? 0) + delta).toFixed(2)));
      });
    });

    return Array.from(totals.entries())
      .sort((a, b) => timeToMinutes(a[0]) - timeToMinutes(b[0]))
      .map(([time, value]) => ({ time, value }));
  }, [selectedChartSectors, sectorsById]);

  const selectedChartDetails = useMemo(() => {
    return selectedChartSectors
      .map(id => sectorsById.get(id))
      .filter((sector): sector is Sector => Boolean(sector));
  }, [selectedChartSectors, sectorsById]);

  const aggregatedChartLabel =
    selectedChartDetails.length === 1
      ? `${selectedChartDetails[0].name} (${selectedChartDetails[0].symbol})`
      : `${selectedChartDetails.length || 0} Sector Net`;

  const aggregatedChartSymbol =
    selectedChartDetails.length === 1 ? selectedChartDetails[0].symbol : 'NET';

  useEffect(() => {
    setSectorTablePage(0);
  }, [tableView, sortOption, adjustedSectors]);

  useEffect(() => {
    const maxPage = Math.max(Math.ceil(filteredSectors.length / itemsPerPage) - 1, 0);
    setSectorTablePage(prev => Math.min(prev, maxPage));
  }, [filteredSectors.length]);

  useEffect(() => {
    if (!showExportOptions) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (exportOptionsRef.current && !exportOptionsRef.current.contains(event.target as Node)) {
        setShowExportOptions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExportOptions]);

  const formatPrice = (price: number) => {
    return price.toFixed(2);
  };

  // Early returns after all hooks
  if (loading) {
    return (
      <div className="min-h-screen bg-pure-black flex items-center justify-center px-8">
        <p className="text-floral-white/70 font-mono text-sm tracking-[0.3em] uppercase">Loading market data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-pure-black flex items-center justify-center px-8">
        <div className="text-center space-y-4">
          <p className="text-error-red font-mono">{error}</p>
          <button
            onClick={() => loadSectors(true)}
            disabled={isSyncing}
            className="rounded-full border border-sage-green px-4 py-2 text-xs uppercase tracking-[0.3em] text-floral-white hover:bg-sage-green/10 disabled:opacity-50"
          >
            {isSyncing ? 'Retrying...' : 'Retry sync'}
          </button>
        </div>
      </div>
    );
  }

  // Show create sector button if no sectors exist
  if (sectors.length === 0) {
    return (
      <div className="min-h-screen bg-pure-black flex items-center justify-center px-8">
        <div className="max-w-md w-full space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-floral-white mb-2 font-mono uppercase">No Sectors Found</h1>
            <p className="text-floral-white/70 font-mono text-sm">
              Create your first sector to get started. A manager agent will be automatically created for it.
            </p>
          </div>
          <button
            onClick={() => router.push('/sectors')}
            className="w-full flex items-center justify-center gap-2 rounded-full bg-sage-green px-5 py-3 text-sm font-semibold uppercase tracking-[0.25em] text-pure-black hover:bg-sage-green/90 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Create Sector
          </button>
        </div>
      </div>
    );
  }

  const filterOptions: ControlOption<TableViewFilter>[] = [
    { value: 'all', label: 'All' },
    { value: 'gainers', label: 'Gainers' },
    { value: 'decliners', label: 'Decliners' },
  ];
  const sortLabels: Record<SortKey, string> = {
    volume: 'Volume',
    price: 'Price',
    agents: 'Active Agents',
    status: 'Utilization',
  };
  const timelineOptions: ControlOption<TimeframeKey>[] = timeframeOrder.map(value => ({
    value,
    label: timeframePresets[value].label,
  }));
  const sortOptionsList: ControlOption<SortKey>[] = (Object.entries(sortLabels) as Array<[SortKey, string]>).map(([value, label]) => ({
    value,
    label,
  }));

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(1)}M`;
    }
    return volume.toLocaleString();
  };

  const getStatusColor = (percent: number) => {
    if (percent >= 45) return 'text-sage-green';
    if (percent >= 30) return 'text-warning-amber';
    return 'text-error-red';
  };

  const getStatusBadge = (percent: number) => {
    if (percent >= 45) return 'bg-sage-green/15 text-sage-green border border-sage-green/30';
    if (percent >= 30) return 'bg-warning-amber/15 text-warning-amber border border-warning-amber/30';
    return 'bg-error-red/10 text-error-red border border-error-red/20';
  };

  const handleRefresh = () => {
    loadSectors();
  };

  const getExportDataset = () => {
    if (exportScope === 'focused' && selectedSector) {
      return [selectedSector];
    }
    if (exportScope === 'all') {
      return filteredSectors;
    }
    return paginatedSectors.length ? paginatedSectors : filteredSectors;
  };

  const exportDetailPresets: Record<
    'summary' | 'full' | 'deep',
    {
      headers: string[];
      map: (sector: Sector) => string[];
    }
  > = {
    summary: {
      headers: ['Symbol', 'Sector', 'Price', 'Change %', 'Status'],
      map: (sector: Sector) => [
        sector.symbol,
        sector.name,
        `$${formatPrice(sector.currentPrice)}`,
        `${sector.changePercent >= 0 ? '+' : ''}${sector.changePercent.toFixed(2)}%`,
        `${sector.statusPercent}%`,
      ],
    },
    full: {
      headers: ['Symbol', 'Sector', 'Price', 'Change', 'Change %', 'Volume', 'Active Agents', 'Total Agents', 'Utilization'],
      map: (sector: Sector) => [
        sector.symbol,
        sector.name,
        `$${formatPrice(sector.currentPrice)}`,
        `${sector.change >= 0 ? '+' : ''}${formatPrice(sector.change)}`,
        `${sector.changePercent >= 0 ? '+' : ''}${sector.changePercent.toFixed(2)}%`,
        formatVolume(sector.volume),
        `${sector.activeAgents}`,
        `${sector.agents.length}`,
        `${Math.round((sector.activeAgents / Math.max(sector.agents.length, 1)) * 100)}%`,
      ],
    },
    deep: {
      headers: ['Symbol', 'Sector', 'Price', 'Volume', 'Utilization', 'Top Agents', 'Current Discussions'],
      map: (sector: Sector) => [
        sector.symbol,
        sector.name,
        `$${formatPrice(sector.currentPrice)}`,
        formatVolume(sector.volume),
        `${Math.round((sector.activeAgents / Math.max(sector.agents.length, 1)) * 100)}%`,
        sector.agents.slice(0, 3).map(agent => agent.name).join(' | ') || 'N/A',
        `${sector.discussions?.length ?? 0}`,
      ],
    },
  };

  const handleExport = () => {
    if (typeof window === 'undefined') return;
    const dataset = getExportDataset();
    if (!dataset.length) return;

    const detailConfig = exportDetailPresets[exportDetailLevel];

    if (exportFormat === 'json') {
      const payload = dataset.map((sector) => {
        const [symbol, name, price, changePercent, status] = exportDetailPresets.summary.map(sector);
        return {
          symbol,
          sector: name,
          price,
          changePercent,
          status,
          volume: formatVolume(sector.volume),
          activeAgents: sector.activeAgents,
          totalAgents: sector.agents.length,
          utilization: `${Math.round((sector.activeAgents / Math.max(sector.agents.length, 1)) * 100)}%`,
          topAgents: sector.agents.slice(0, 3).map(agent => ({
            name: agent.name,
            role: agent.role,
            status: agent.status,
          })),
          discussions: (sector.discussions ?? []).length,
          timeframe: timeframeLabel,
        };
      });

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `sector-export-${exportDetailLevel}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setShowExportOptions(false);
      return;
    }

    const rows = dataset.map(sector => detailConfig.map(sector).join(','));
    const csv = [detailConfig.headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `sector-export-${exportDetailLevel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    setShowExportOptions(false);
  };

  // Handle MARKET INDEX card navigation
  const totalSectorCount = adjustedSectors.length;

  const handleMarketIndexPrev = () => {
    if (marketIndexView === 'overview') {
      setMarketIndexView(totalSectorCount - 1);
    } else {
      const newIndex = (marketIndexView as number) - 1;
      setMarketIndexView(newIndex < 0 ? 'overview' : newIndex);
    }
  };

  const handleMarketIndexNext = () => {
    if (marketIndexView === 'overview') {
      setMarketIndexView(0);
    } else {
      const newIndex = (marketIndexView as number) + 1;
      setMarketIndexView(newIndex >= totalSectorCount ? 'overview' : newIndex);
    }
  };

  const handleOverviewClick = () => {
    setMarketIndexView('overview');
  };

  const handleToggleChartSelection = (sectorId: string) => {
    setSelectedChartSectors(prev => {
      if (prev.includes(sectorId)) {
        return prev.filter(id => id !== sectorId);
      }
      return [...prev, sectorId];
    });
  };
  const handleClearChartSelection = () => setSelectedChartSectors([]);

  const allFilteredSelected =
    filteredSectors.length > 0 && filteredSectors.every(sector => selectedChartSectors.includes(sector.id));
  const handleSelectAllSectors = () => {
    if (allFilteredSelected) {
      setSelectedChartSectors([]);
      return;
    }
    setSelectedChartSectors(filteredSectors.map(sector => sector.id));
  };

  const handleSectorTablePrev = () => {
    if (canGoPrevPage) {
      setSectorTablePage(prev => Math.max(0, prev - 1));
    }
  };

  const handleSectorTableNext = () => {
    if (canGoNextPage) {
      setSectorTablePage(prev => Math.min(totalPages - 1, prev + 1));
    }
  };

  const chartDefaults = timeframePresets[selectedTimeframe] ?? timeframePresets['4H'];
  const timeframeFriendly: Record<TimeframeKey, string> = {
    '1H': '1 Hour',
    '4H': '4 Hours',
    '12H': '12 Hours',
    '24H': '24 Hours',
  };
  const timeframeLabel = timeframeFriendly[selectedTimeframe];
  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '--:--';
  const exportScopeOptions = [
    {
      id: 'window' as const,
      label: 'Visible window',
      helper: filteredSectors.length ? `${currentRangeStart}-${currentRangeEnd} rows` : 'No rows visible',
    },
    {
      id: 'all' as const,
      label: 'Full filtered dataset',
      helper: `${filteredSectors.length} rows with filters applied`,
    },
    {
      id: 'focused' as const,
      label: selectedSector ? `Focused: ${selectedSector.symbol}` : 'Focused sector',
      helper: selectedSector ? selectedSector.name : 'Select a sector in the navigator',
    },
  ];
  const exportDetailOptions = [
    { id: 'summary' as const, label: 'Summary', helper: 'Headline KPIs' },
    { id: 'full' as const, label: 'Full', helper: 'Adds depth + utilization' },
    { id: 'deep' as const, label: 'Deep dive', helper: 'Includes agents & discussion counts' },
  ];
  const exportFormatOptions = [
    { id: 'csv' as const, label: 'CSV', helper: 'Spreadsheet ready' },
    { id: 'json' as const, label: 'JSON', helper: 'For automation' },
  ];

  return (
    <div className="min-h-screen bg-pure-black">
      <div className="max-w-[1920px] mx-auto px-8 py-6">

        {/* Market Overview Cards */}
        <div className="grid grid-cols-4 gap-4 mb-4">
          {/* MARKET INDEX Card */}
          <div className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey">
            <span className="text-xs uppercase text-floral-white/70 tracking-wide font-mono block mb-2">
              MARKET INDEX
            </span>
            {selectedSector && (
              <span className="text-[0.65rem] uppercase text-floral-white/50 tracking-[0.3em] font-mono block mb-1">
                {selectedSector.name} • {selectedSector.symbol}
              </span>
            )}
            <div className="text-3xl font-bold text-floral-white mb-1 font-mono">
              {displayedIndexValue.toFixed(2)}
            </div>
            <div className={`text-sm font-medium font-mono ${changeAccentClass}`}>
              {`${displayedChangePercent >= 0 ? '+' : ''}${displayedChangePercent.toFixed(2)}%`}
            </div>
          </div>

          {/* TOTAL VOLUME Card */}
          <div className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey">
            <span className="text-xs uppercase text-floral-white/70 tracking-wide block mb-2 font-mono">TOTAL VOLUME</span>
            <div className="text-3xl font-bold text-floral-white mb-1 font-mono">{formatVolume(cardSummaries.volumeValue)}</div>
            <div className="text-xs text-floral-white/50 font-mono">{cardSummaries.volumeSubtitle}</div>
          </div>

          {/* TOTAL AGENTS Card */}
          <div className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey">
            <span className="text-xs uppercase text-floral-white/70 tracking-wide block mb-2 font-mono">TOTAL AGENTS</span>
            <div className="text-3xl font-bold text-floral-white mb-1 font-mono">{cardSummaries.totalAgentsValue}</div>
            <div className="text-xs text-floral-white/50 font-mono">{cardSummaries.totalAgentsSubtitle}</div>
          </div>

          {/* ACTIVE AGENTS Card */}
          <div className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey">
            <span className="text-xs uppercase text-floral-white/70 tracking-wide block mb-2 font-mono">ACTIVE AGENTS</span>
            <div className="text-3xl font-bold text-floral-white mb-1 font-mono">{cardSummaries.activeAgentsValue}</div>
            <div className="text-xs text-floral-white/50 font-mono">{cardSummaries.activeAgentsSubtitle}</div>
          </div>
        </div>

        {/* On-Chain Activity Card */}
        <div className="mb-4">
          <div 
            onClick={() => router.push('/contract-activity')}
            className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey cursor-pointer hover:border-sage-green transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase text-floral-white/70 tracking-wide font-mono">ON-CHAIN ACTIVITY</span>
              <LinkIcon className="w-4 h-4 text-sage-green" />
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div>
                <div className="text-2xl font-bold text-sage-green font-mono">{contractCounts.sectors}</div>
                <div className="text-xs text-floral-white/50 font-mono mt-1">Sectors on chain</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-warning-amber font-mono">{contractCounts.agents}</div>
                <div className="text-xs text-floral-white/50 font-mono mt-1">Agents on chain</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-sky-blue font-mono">{contractCounts.trades}</div>
                <div className="text-xs text-floral-white/50 font-mono mt-1">On-chain trades</div>
              </div>
            </div>
          </div>
        </div>

        {/* Cross-Sector Navigator & Overview */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={handleMarketIndexPrev}
              className="px-3 py-2 rounded border border-ink-500 text-lg font-mono text-floral-white hover:border-sage-green transition-colors"
              aria-label="View previous sector"
            >
              &lt;
            </button>
            <div className="text-sm font-mono text-floral-white/80 uppercase tracking-[0.3em]">
              {currentViewLabel}
            </div>
            <button
              onClick={handleMarketIndexNext}
              className="px-3 py-2 rounded border border-ink-500 text-lg font-mono text-floral-white hover:border-sage-green transition-colors"
              aria-label="View next sector"
            >
              &gt;
            </button>
          </div>

          <button
            onClick={handleOverviewClick}
            className="inline-flex items-center justify-center rounded-full bg-sage-green px-5 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-pure-black hover:bg-sage-green/90 transition-colors"
          >
            Overview
          </button>
        </div>

        {/* Navigator & Controls */}
        <div className="bg-card-bg/80 border border-ink-500 rounded-2xl px-5 py-5 mb-6 space-y-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-ink-500/60 pb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={handleSectorTablePrev}
                disabled={!canGoPrevPage}
                className="px-3 py-2 rounded-full border border-ink-500 text-lg font-mono text-floral-white hover:border-sage-green disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                &lt;
              </button>
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-floral-white/50 font-mono">Sector Window</p>
                <p className="text-sm text-floral-white font-mono">
                  {currentRangeStart}-{currentRangeEnd} of {filteredSectors.length || 0}
                </p>
              </div>
              <button
                onClick={handleSectorTableNext}
                disabled={!canGoNextPage}
                className="px-3 py-2 rounded-full border border-ink-500 text-lg font-mono text-floral-white hover:border-sage-green disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                &gt;
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex flex-wrap gap-4">
              <ControlSelect
                label="Timeline"
                value={selectedTimeframe}
                options={timelineOptions}
                onChange={(value) => setSelectedTimeframe(value as TimeframeKey)}
              />
              <ControlSelect
                label="Filter"
                value={tableView}
                options={filterOptions}
                onChange={(value) => setTableView(value as TableViewFilter)}
              />
              <ControlSelect
                label="Sort By"
                value={sortOption}
                options={sortOptionsList}
                onChange={(value) => setSortOption(value as SortKey)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={isSyncing}
                className="flex items-center gap-2 rounded-xl border border-ink-500 bg-card-bg/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-floral-white/80 hover:border-sage-green transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCcw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-sage-green' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync'}
              </button>
              <div className="relative" ref={exportOptionsRef}>
                <button
                  onClick={() => setShowExportOptions(prev => !prev)}
                  className="flex items-center gap-2 rounded-xl bg-sage-green px-3 py-2 text-xs font-semibold uppercase tracking-wide text-pure-black hover:bg-sage-green/90 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export
                  <ChevronDown className={`w-3 h-3 transition-transform ${showExportOptions ? 'rotate-180' : ''}`} />
                </button>
                {showExportOptions && (
                  <div className="absolute right-0 z-30 mt-3 w-80 rounded-2xl border border-ink-500 bg-card-bg/95 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.65)]">
                    <div className="mb-4">
                      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-floral-white/60">Scope</p>
                      <div className="mt-2 space-y-2">
                        {exportScopeOptions.map(option => (
                          <label
                            key={option.id}
                            className={`flex cursor-pointer flex-col rounded-xl border px-3 py-2 transition-colors ${
                              exportScope === option.id
                                ? 'border-sage-green bg-sage-green/10 text-floral-white'
                                : 'border-ink-500/80 text-floral-white/70 hover:border-sage-green/60'
                            }`}
                          >
                            <input
                              type="radio"
                              name="export-scope"
                              className="sr-only"
                              checked={exportScope === option.id}
                              onChange={() => setExportScope(option.id)}
                            />
                            <span className="text-sm font-semibold">{option.label}</span>
                            <span className="text-[0.65rem] text-floral-white/60">{option.helper}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="mb-4">
                      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-floral-white/60">Detail level</p>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {exportDetailOptions.map(option => (
                          <label
                            key={option.id}
                            className={`flex cursor-pointer flex-col rounded-xl border px-3 py-2 text-center transition-colors ${
                              exportDetailLevel === option.id
                                ? 'border-sage-green bg-sage-green/10 text-floral-white'
                                : 'border-ink-500/80 text-floral-white/70 hover:border-sage-green/60'
                            }`}
                          >
                            <input
                              type="radio"
                              name="export-detail"
                              className="sr-only"
                              checked={exportDetailLevel === option.id}
                              onChange={() => setExportDetailLevel(option.id)}
                            />
                            <span className="text-sm font-semibold">{option.label}</span>
                            <span className="text-[0.6rem] text-floral-white/60">{option.helper}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="mb-4">
                      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-floral-white/60">Format</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {exportFormatOptions.map(option => (
                          <label
                            key={option.id}
                            className={`flex cursor-pointer flex-col rounded-xl border px-3 py-2 transition-colors ${
                              exportFormat === option.id
                                ? 'border-sage-green bg-sage-green/10 text-floral-white'
                                : 'border-ink-500/80 text-floral-white/70 hover:border-sage-green/60'
                            }`}
                          >
                            <input
                              type="radio"
                              name="export-format"
                              className="sr-only"
                              checked={exportFormat === option.id}
                              onChange={() => setExportFormat(option.id)}
                            />
                            <span className="text-sm font-semibold">{option.label}</span>
                            <span className="text-[0.6rem] text-floral-white/60">{option.helper}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={handleExport}
                      className="w-full rounded-xl bg-sage-green py-2 text-xs font-semibold uppercase tracking-[0.25em] text-pure-black hover:bg-sage-green/90 transition-colors"
                    >
                      Generate export
                    </button>
                  </div>
                )}
              </div>
              <span className="text-xs text-floral-white/60 font-mono">Updated {lastUpdatedLabel}</span>
            </div>
          </div>
        </div>

        {/* Sector Performance Data Table */}
        <div className="bg-card-bg/80 rounded-2xl border border-ink-500 mb-6 overflow-hidden">
          <div className="px-5 py-4 border-b border-ink-500/70 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-floral-white uppercase tracking-[0.32em] font-mono">SECTOR PERFORMANCE DATA</h3>
              <p className="text-xs text-floral-white/60 font-mono mt-1">All sectors • {timeframeLabel}</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <button
                onClick={handleSelectAllSectors}
                className="rounded-full border border-ink-500 px-3 py-1 uppercase tracking-[0.3em] text-floral-white/70 hover:border-sage-green hover:text-floral-white transition-colors"
              >
                {allFilteredSelected ? 'Clear All' : 'Select All'}
              </button>
              <span className="text-floral-white/60">Synced {lastUpdatedLabel}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border border-ink-500 bg-card-bg font-mono text-[0.85rem]">
              <thead>
                <tr className="bg-ink-600 text-floral-white/70 uppercase tracking-[0.2em]">
                  <th className="px-3 py-3 border border-ink-500 text-center text-[0.6rem]">Chart</th>
                  {['Symbol', 'Sector', 'Price', 'Change', 'Change %', 'Volume', 'Agents', 'Active', 'Status'].map((heading) => (
                    <th key={heading} className="px-4 py-3 border border-ink-500 text-left text-[0.6rem]">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedSectors.length ? (
                  paginatedSectors.map((sector, index) => {
                    const isSelected = selectedChartSectors.includes(sector.id);
                    return (
                      <tr
                        key={sector.id}
                        className={`cursor-pointer transition-colors ${
                          index % 2 === 0 ? 'bg-shadow-grey/60' : 'bg-shadow-grey/40'
                        } hover:bg-shadow-grey/80`}
                        onClick={() => router.push(`/sectors/${sector.id}`)}
                      >
                        <td
                          className="px-3 py-3 border border-ink-500 text-center"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-ink-500 bg-transparent text-sage-green focus:ring-sage-green"
                            checked={isSelected}
                            onChange={() => handleToggleChartSelection(sector.id)}
                            aria-label={`Toggle ${sector.name} in chart`}
                          />
                        </td>
                        <td className="px-4 py-3 border border-ink-500 text-floral-white font-semibold">
                          {sector.symbol || 'N/A'}
                        </td>
                        <td className="px-4 py-3 border border-ink-500 text-floral-white/85">
                          {sector.name}
                        </td>
                        <td className="px-4 py-3 border border-ink-500 text-floral-white">
                          ${formatPrice(sector.currentPrice)}
                        </td>
                        <td className={`px-4 py-3 border border-ink-500 ${sector.change >= 0 ? 'text-sage-green' : 'text-error-red'}`}>
                          {sector.change >= 0 ? '+' : ''}{formatPrice(sector.change)}
                        </td>
                        <td className={`px-4 py-3 border border-ink-500 ${sector.changePercent >= 0 ? 'text-sage-green' : 'text-error-red'}`}>
                          {sector.changePercent >= 0 ? '+' : ''}{sector.changePercent.toFixed(2)}%
                        </td>
                        <td className="px-4 py-3 border border-ink-500 text-floral-white/80">
                          {formatVolume(sector.volume)}
                        </td>
                        <td className="px-4 py-3 border border-ink-500 text-floral-white/80">
                          {sector.agents.length}
                        </td>
                        <td className="px-4 py-3 border border-ink-500 text-floral-white">
                          {sector.activeAgents}
                        </td>
                        <td className="px-4 py-3 border border-ink-500">
                          <span className={`px-3 py-1 rounded-full text-[0.65rem] font-semibold uppercase tracking-[0.2em] inline-flex items-center justify-center ${getStatusBadge(sector.statusPercent)}`}>
                            {sector.statusPercent}%
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-floral-white/60 font-mono">
                      {filteredSectors.length === 0 && sectors.length === 0 
                        ? 'No data available for this currently.' 
                        : 'No sectors match the current filters.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-ink-500/70 text-xs uppercase tracking-[0.3em] text-floral-white/60 font-mono">
            Viewing {currentRangeStart}-{currentRangeEnd} of {filteredSectors.length || 0} • Page {Math.min(sectorTablePage + 1, totalPages)} / {totalPages}
          </div>
        </div>

        {/* Agents Table */}
        <div className="bg-card-bg/80 rounded-2xl border border-ink-500 mb-6 overflow-hidden">
          <div className="px-5 py-4 border-b border-ink-500/70 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-floral-white uppercase tracking-[0.32em] font-mono">AGENTS DATA</h3>
              <p className="text-xs text-floral-white/60 font-mono mt-1">All agents from visible sectors</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="text-floral-white/60">Total: {paginatedSectors.reduce((sum, sector) => sum + (sector.agents?.length || 0), 0)} agents</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border border-ink-500 bg-card-bg font-mono text-[0.85rem]">
              <thead>
                <tr className="bg-ink-600 text-floral-white/70 uppercase tracking-[0.2em]">
                  {['Name', 'Role', 'Sector', 'Status', 'Performance', 'Trades', 'Risk Tolerance', 'Decision Style', 'Created'].map((heading) => (
                    <th key={heading} className="px-4 py-3 border border-ink-500 text-left text-[0.6rem]">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const allAgents = paginatedSectors.flatMap(sector => 
                    (sector.agents || []).map(agent => ({ ...agent, sectorSymbol: sector.symbol, sectorName: sector.name }))
                  );
                  
                  if (allAgents.length === 0) {
                    return (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-floral-white/60 font-mono">
                          No agents found in visible sectors.
                        </td>
                      </tr>
                    );
                  }
                  
                  return allAgents.map((agent, index) => {
                    const statusColors = {
                      active: 'bg-sage-green/20 text-sage-green border-sage-green/50',
                      idle: 'bg-floral-white/10 text-floral-white/70 border-floral-white/30',
                      processing: 'bg-sky-blue/20 text-sky-blue border-sky-blue/50',
                    };
                    const statusColor = statusColors[agent.status as keyof typeof statusColors] || statusColors.idle;
                    const createdDate = agent.createdAt ? new Date(agent.createdAt).toLocaleDateString() : 'N/A';
                    
                    return (
                      <tr
                        key={agent.id}
                        className={`transition-colors ${
                          index % 2 === 0 ? 'bg-shadow-grey/60' : 'bg-shadow-grey/40'
                        } hover:bg-shadow-grey/80 cursor-pointer`}
                        onClick={() => router.push(`/agents?agent=${agent.id}`)}
                      >
                        <td className="px-4 py-3 border border-ink-500 text-floral-white font-semibold">
                          {agent.name}
                        </td>
                        <td className="px-4 py-3 border border-ink-500 text-floral-white/85 text-sm">
                          {agent.role}
                        </td>
                        <td className="px-4 py-3 border border-ink-500 text-floral-white/80">
                          {agent.sectorSymbol || 'N/A'}
                        </td>
                        <td className="px-4 py-3 border border-ink-500 text-center">
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-mono uppercase tracking-wider border ${statusColor}`}>
                            {agent.status}
                          </span>
                        </td>
                        <td className={`px-4 py-3 border border-ink-500 text-right font-semibold ${
                          agent.performance >= 0 ? 'text-sage-green' : 'text-error-red'
                        }`}>
                          {agent.performance >= 0 ? '+' : ''}{agent.performance.toFixed(2)}%
                        </td>
                        <td className="px-4 py-3 border border-ink-500 text-right text-floral-white">
                          {agent.trades}
                        </td>
                        <td className="px-4 py-3 border border-ink-500 text-floral-white/70 text-sm">
                          {agent.personality?.riskTolerance || 'Unknown'}
                        </td>
                        <td className="px-4 py-3 border border-ink-500 text-floral-white/70 text-sm">
                          {agent.personality?.decisionStyle || 'Unknown'}
                        </td>
                        <td className="px-4 py-3 border border-ink-500 text-floral-white/60 text-xs">
                          {createdDate}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Sector Net Chart */}
        <div className="bg-card-bg/80 rounded-2xl border border-ink-500 p-6">
          <div className="mb-4 flex flex-col gap-1">
            <p className="text-xs uppercase tracking-[0.35em] text-floral-white/50 font-mono">Net movement</p>
            <h2 className="text-lg font-semibold text-floral-white font-mono">
              {selectedChartSectors.length ? aggregatedChartLabel : 'Select sectors to plot'}
            </h2>
            <p className="text-sm text-floral-white/60 font-mono">
              Window {chartDefaults.window}h · Increment {chartDefaults.increment}m · {timeframeLabel} range
            </p>
          </div>

          {selectedChartSectors.length === 0 ? (
            <div className="rounded-xl border border-dashed border-ink-500/70 bg-ink-600/40 p-6 text-center text-sm text-floral-white/60">
              Use the chart column in the table above to choose one or more sectors. The combined profit/loss curve will render here automatically.
            </div>
          ) : aggregatedChartData.length === 0 ? (
            <div className="rounded-xl border border-ink-500 bg-ink-600/40 p-6 text-center text-sm text-floral-white/60">
              No data available for this currently.
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                {selectedChartDetails.map(detail => (
                  <span
                    key={detail.id}
                    className="rounded-full border border-ink-500/70 px-3 py-1 text-[0.65rem] uppercase tracking-[0.3em] text-floral-white/70"
                  >
                    {detail.symbol}
                  </span>
                ))}
                <button
                  onClick={handleClearChartSelection}
                  className="ml-auto text-xs uppercase tracking-[0.3em] text-floral-white/60 hover:text-floral-white"
                >
                  Clear
                </button>
              </div>
              <LineChart
                key={`${selectedChartSectors.join('-') || 'none'}-${selectedTimeframe}`}
                data={aggregatedChartData}
                sectorName={aggregatedChartLabel}
                sectorSymbol={aggregatedChartSymbol}
                initialWindowHours={chartDefaults.window}
                initialTickIncrement={chartDefaults.increment}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

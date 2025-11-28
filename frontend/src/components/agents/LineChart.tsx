/**
 * LineChart component for displaying performance data.
 * Simple SVG-based line chart for agent performance visualization.
 */

'use client';

interface LineChartProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  showGrid?: boolean;
  label?: string;
}

export default function LineChart({
  data,
  width = 400,
  height = 200,
  color = '#3b82f6',
  showGrid = true,
  label,
}: LineChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-800/50 rounded-lg border border-gray-700">
        <p className="text-gray-400">No data available</p>
      </div>
    );
  }

  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  // Calculate min and max for scaling
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1; // Avoid division by zero

  // Generate points
  const points = data.map((value, index) => {
    const x = padding + (index / (data.length - 1 || 1)) * chartWidth;
    const y = padding + chartHeight - ((value - min) / range) * chartHeight;
    return { x, y, value };
  });

  // Create path string for the line
  const pathData = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');

  // Create area path (for gradient fill)
  const areaPath = `${pathData} L ${points[points.length - 1].x} ${padding + chartHeight} L ${points[0].x} ${padding + chartHeight} Z`;

  return (
    <div className="w-full">
      {label && (
        <h3 className="text-sm font-medium text-gray-400 mb-2">{label}</h3>
      )}
      <svg
        width={width}
        height={height}
        className="w-full h-auto"
        viewBox={`0 0 ${width} ${height}`}
      >
        {/* Grid lines */}
        {showGrid && (
          <g stroke="#374151" strokeWidth="1" strokeDasharray="2,2">
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = padding + chartHeight - ratio * chartHeight;
              return (
                <line
                  key={ratio}
                  x1={padding}
                  y1={y}
                  x2={width - padding}
                  y2={y}
                />
              );
            })}
          </g>
        )}

        {/* Gradient definition */}
        <defs>
          <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* Area fill */}
        <path
          d={areaPath}
          fill="url(#areaGradient)"
          stroke="none"
        />

        {/* Line */}
        <path
          d={pathData}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {points.map((point, index) => (
          <circle
            key={index}
            cx={point.x}
            cy={point.y}
            r="3"
            fill={color}
            className="hover:r-4 transition-all"
          />
        ))}

        {/* Y-axis labels */}
        {showGrid && (
          <g fill="#9ca3af" fontSize="10" textAnchor="end">
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const value = min + (1 - ratio) * range;
              const y = padding + chartHeight - ratio * chartHeight;
              return (
                <text key={ratio} x={padding - 8} y={y + 4}>
                  {value.toFixed(1)}
                </text>
              );
            })}
          </g>
        )}
      </svg>
    </div>
  );
}


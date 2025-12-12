import React from 'react';

/**
 * Format message content with proper styling using React elements (not HTML strings):
 * - Remove markdown asterisks and convert to proper formatting
 * - Bold sector names
 * - Underline executable actions (BUY, SELL, HOLD)
 * - Format numbers and percentages
 */
export function formatMessageContent(content: string): React.ReactNode {
  if (!content) return content;

  // Common sector names to bold (case-insensitive)
  const sectorNames = [
    'tech sector',
    'technology sector',
    'healthcare sector',
    'finance sector',
    'energy sector',
    'consumer sector',
    'industrial sector',
    'materials sector',
    'utilities sector',
    'real estate sector',
    'communication sector',
    'NVIDIA',
    'NVDA',
    'AAPL',
    'MSFT',
    'GOOGL',
    'AMZN',
    'TSLA',
    'META',
  ];

  // Executable actions to underline
  const actions = ['BUY', 'SELL', 'HOLD', 'REBALANCE'];

  /**
   * Format a text segment into React elements
   * This function processes text and returns an array of React elements
   */
  const formatTextToElements = (text: string, keyPrefix: string = ''): React.ReactNode[] => {
    if (!text) return [];

    const parts: React.ReactNode[] = [];
    let currentText = text;
    let keyCounter = 0;

    // First, remove markdown formatting
    currentText = currentText.replace(/\*\*([^*]+)\*\*/g, '$1'); // Remove **bold**
    currentText = currentText.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '$1'); // Remove *italic*

    // Process in order: sectors, actions, percentages, dollar amounts
    // Use a map to track which characters are already formatted
    const formattedRanges = new Set<number>();
    const segments: Array<{ start: number; end: number; type: 'sector' | 'action' | 'percent' | 'dollar' | 'text'; content: string }> = [];
    
    // Helper to check if a range is available
    const isRangeAvailable = (start: number, end: number): boolean => {
      for (let i = start; i < end; i++) {
        if (formattedRanges.has(i)) return false;
      }
      return true;
    };

    // Helper to mark a range as used
    const markRangeUsed = (start: number, end: number): void => {
      for (let i = start; i < end; i++) {
        formattedRanges.add(i);
      }
    };
    
    // Find all sectors (highest priority)
    sectorNames.forEach((sector) => {
      const regex = new RegExp(`\\b${sector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      let match;
      while ((match = regex.exec(currentText)) !== null) {
        const start = match.index;
        const end = match.index + match[0].length;
        if (isRangeAvailable(start, end)) {
          segments.push({
            start,
            end,
            type: 'sector',
            content: match[0]
          });
          markRangeUsed(start, end);
        }
      }
    });

    // Find all actions
    actions.forEach((action) => {
      const regex = new RegExp(`\\b${action}\\b`, 'gi');
      let match;
      while ((match = regex.exec(currentText)) !== null) {
        const start = match.index;
        const end = match.index + match[0].length;
        if (isRangeAvailable(start, end)) {
          segments.push({
            start,
            end,
            type: 'action',
            content: match[0]
          });
          markRangeUsed(start, end);
        }
      }
    });

    // Find all percentages
    const percentRegex = /(\d+(?:\.\d+)?)\s*%/g;
    let match;
    while ((match = percentRegex.exec(currentText)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      if (isRangeAvailable(start, end)) {
        segments.push({
          start,
          end,
          type: 'percent',
          content: match[0]
        });
        markRangeUsed(start, end);
      }
    }

    // Find all dollar amounts
    const dollarRegex = /\$(\d+(?:,\d{3})*(?:\.\d{2})?)/g;
    while ((match = dollarRegex.exec(currentText)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      if (isRangeAvailable(start, end)) {
        segments.push({
          start,
          end,
          type: 'dollar',
          content: match[0]
        });
        markRangeUsed(start, end);
      }
    }

    // Sort segments by start position
    segments.sort((a, b) => a.start - b.start);

    // Build React elements from segments
    let lastIndex = 0;
    segments.forEach((segment) => {
      // Add text before segment
      if (segment.start > lastIndex) {
        const beforeText = currentText.substring(lastIndex, segment.start);
        if (beforeText) {
          parts.push(
            <React.Fragment key={`${keyPrefix}-text-${keyCounter++}`}>
              {beforeText}
            </React.Fragment>
          );
        }
      }

      // Add formatted segment
      const key = `${keyPrefix}-${segment.type}-${keyCounter++}`;
      switch (segment.type) {
        case 'sector':
          parts.push(
            <strong key={key} className="text-sage-green font-semibold">
              {segment.content}
            </strong>
          );
          break;
        case 'action':
          parts.push(
            <u key={key} className="underline decoration-sage-green decoration-2">
              {segment.content}
            </u>
          );
          break;
        case 'percent':
          parts.push(
            <strong key={key} className="text-warning-amber font-semibold">
              {segment.content}
            </strong>
          );
          break;
        case 'dollar':
          parts.push(
            <strong key={key} className="text-sage-green font-semibold">
              {segment.content}
            </strong>
          );
          break;
        default:
          parts.push(
            <React.Fragment key={key}>
              {segment.content}
            </React.Fragment>
          );
      }

      lastIndex = segment.end;
    });

    // Add remaining text
    if (lastIndex < currentText.length) {
      const remaining = currentText.substring(lastIndex);
      if (remaining) {
        parts.push(
          <React.Fragment key={`${keyPrefix}-text-${keyCounter++}`}>
            {remaining}
          </React.Fragment>
        );
      }
    }

    // If no segments found, return the text as-is
    if (parts.length === 0) {
      return [<React.Fragment key={`${keyPrefix}-plain-0`}>{currentText}</React.Fragment>];
    }

    return parts;
  };

  // Split by newlines and format each line
  const lines = content.split('\n');
  const formattedLines: React.ReactNode[] = [];

  lines.forEach((line, lineIndex) => {
    const trimmedLine = line.trim();

    // Empty line
    if (trimmedLine === '') {
      formattedLines.push(<br key={`line-${lineIndex}`} />);
      return;
    }

    // Check if it's a section header (starts with ** or #)
    if (trimmedLine.match(/^(\*\*|#+)\s*.+/)) {
      const headerText = trimmedLine.replace(/^(\*\*|#+)\s*/, '').replace(/\*\*/g, '').trim();
      formattedLines.push(
        <div key={`line-${lineIndex}`} className="mt-4 mb-2 first:mt-0">
          <strong className="text-sage-green text-base font-semibold">
            {formatTextToElements(headerText, `header-${lineIndex}`)}
          </strong>
        </div>
      );
      return;
    }

    // Check if it's a bullet point
    if (trimmedLine.match(/^[\*\-\•]\s+/)) {
      const bulletText = trimmedLine.replace(/^[\*\-\•]\s+/, '').trim();
      formattedLines.push(
        <div key={`line-${lineIndex}`} className="ml-4 mb-1.5 flex items-start">
          <span className="text-sage-green mr-2 mt-0.5 flex-shrink-0">•</span>
          <span className="flex-1">
            {formatTextToElements(bulletText, `bullet-${lineIndex}`)}
          </span>
        </div>
      );
      return;
    }

    // Regular paragraph
    formattedLines.push(
      <p key={`line-${lineIndex}`} className="mb-2 leading-relaxed">
        {formatTextToElements(line, `para-${lineIndex}`)}
      </p>
    );
  });

  return <div className="space-y-1">{formattedLines}</div>;
}

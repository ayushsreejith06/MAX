"use client";

import type { Message } from '@/src/lib/types';
import { getInitials, getAgentColor } from './utils';

interface MessageBubbleProps {
  message: Message;
  isThreaded?: boolean;
  threadLevel?: number;
}

export function MessageBubble({ message, isThreaded = false, threadLevel = 0 }: MessageBubbleProps) {
  const initials = getInitials(message.agentName);
  const timestamp = new Date(message.timestamp);
  const timeString = timestamp.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  const colorClass = message.agentId ? getAgentColor(message.agentId) : 'from-blue-500 to-purple-600';

  return (
    <div
      className={`flex gap-3 ${isThreaded ? 'mt-2' : 'mt-4'}`}
      style={isThreaded && threadLevel > 0 ? { marginLeft: `${threadLevel * 1.5}rem` } : {}}
    >
      {/* Avatar - only show if not threaded or first in thread */}
      {!isThreaded && (
        <div className="flex-shrink-0">
          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${colorClass} flex items-center justify-center text-primary-text font-semibold text-sm shadow-dark-lg ring-2 ring-background`}>
            {initials}
          </div>
        </div>
      )}
      
      {/* Spacer for threaded messages */}
      {isThreaded && <div className="w-10 flex-shrink-0" />}

      {/* Message Content */}
      <div className="flex-1 min-w-0">
        {!isThreaded && (
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className="text-primary-text font-semibold text-sm">{message.agentName}</span>
            <span className="text-primary-text/60 text-xs">{timeString}</span>
          </div>
        )}
        <div className="bg-card border border-card rounded-2xl rounded-tl-sm px-4 py-3 shadow-dark-md hover:border-accent/50 transition-colors">
          <p className="text-primary-text text-sm leading-relaxed whitespace-pre-wrap break-words font-mono">
            {message.content}
          </p>
        </div>
        {isThreaded && (
          <div className="text-primary-text/40 text-xs mt-1 ml-1">{timeString}</div>
        )}
      </div>
    </div>
  );
}


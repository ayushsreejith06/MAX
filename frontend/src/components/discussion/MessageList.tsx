"use client";

import { useEffect, useRef } from 'react';
import type { Message } from '@/src/lib/types';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom on load and when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-primary-text/60 text-sm">No messages in this discussion yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      {messages.map((message, index) => {
        // Check if this is a threaded message (same agent as previous)
        const prevMessage = index > 0 ? messages[index - 1] : null;
        const isThreaded = prevMessage?.agentId === message.agentId;
        
        // Calculate thread level (simple implementation - can be enhanced)
        let threadLevel = 0;
        if (isThreaded) {
          let currentIndex = index - 1;
          while (currentIndex >= 0 && messages[currentIndex].agentId === message.agentId) {
            threadLevel++;
            currentIndex--;
          }
          // Limit thread level to prevent excessive indentation
          threadLevel = Math.min(threadLevel, 3);
        }

        return (
          <MessageBubble
            key={message.id}
            message={message}
            isThreaded={isThreaded}
            threadLevel={threadLevel}
          />
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
}


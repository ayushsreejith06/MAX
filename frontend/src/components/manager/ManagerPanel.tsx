"use client";

import { useState } from "react";

interface ManagerPanelProps {
  initialStatus: "created" | "active" | "closed" | "archived";
  onStatusChange?: (newStatus: "active" | "closed") => void;
}

/**
 * ManagerPanel - Control panel for ManagerAgent to open/close discussions.
 * Only visible when agentRole === "manager" (controlled by parent).
 * This component only manages UI state, not backend state.
 */
export default function ManagerPanel({ 
  initialStatus, 
  onStatusChange 
}: ManagerPanelProps) {
  // Map initial status to local state: "active" stays active, everything else is "closed"
  const [localStatus, setLocalStatus] = useState<"active" | "closed">(
    initialStatus === "active" ? "active" : "closed"
  );

  const handleOpenDiscussion = () => {
    const newStatus: "active" = "active";
    setLocalStatus(newStatus);
    onStatusChange?.(newStatus);
  };

  const handleCloseDiscussion = () => {
    const newStatus: "closed" = "closed";
    setLocalStatus(newStatus);
    onStatusChange?.(newStatus);
  };

  // Show OPEN button if status is closed, created, or archived
  // Show CLOSE button if status is active
  const isActive = localStatus === "active";
  const isClosed = !isActive; // closed, created, or archived

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
      <h2 className="text-xl font-semibold text-white mb-4">Manager Panel</h2>
      
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="text-sm text-gray-400 mb-2">Discussion Status</p>
            <span className="px-3 py-1 text-sm font-medium bg-blue-500/20 text-blue-300 rounded capitalize">
              {localStatus}
            </span>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          {isClosed && (
            <button
              onClick={handleOpenDiscussion}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              OPEN DISCUSSION
            </button>
          )}
          
          {isActive && (
            <button
              onClick={handleCloseDiscussion}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              CLOSE DISCUSSION
            </button>
          )}
        </div>

        <p className="text-xs text-gray-500 italic mt-4">
          Note: Changes are UI-only and do not affect backend state.
        </p>
      </div>
    </div>
  );
}


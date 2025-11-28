"use client";

import { useState } from "react";
import ManagerPanel from "@/src/components/manager/ManagerPanel";
import type { DiscussionStatus } from "@/src/lib/types";

interface ManagerControlsProps {
  discussionStatus: DiscussionStatus;
  agentRole?: string; // Mock flag: "manager" to show panel, anything else hides it
}

/**
 * ManagerControls - Wrapper component that conditionally renders ManagerPanel
 * based on agentRole. Only shows when agentRole === "manager".
 * 
 * This component isolates manager controls from user actions and ensures
 * only ManagerAgent can control discussion state.
 */
export default function ManagerControls({ 
  discussionStatus, 
  agentRole = "user" // Default to "user" to hide panel by default
}: ManagerControlsProps) {
  const [uiStatus, setUiStatus] = useState<"active" | "closed">(
    discussionStatus === "active" ? "active" : "closed"
  );

  // Only render ManagerPanel if agentRole is "manager"
  if (agentRole !== "manager") {
    return null;
  }

  const handleStatusChange = (newStatus: "active" | "closed") => {
    setUiStatus(newStatus);
    // UI state only - no backend call
    console.log(`[ManagerAgent] Discussion status changed to: ${newStatus} (UI only)`);
  };

  return (
    <ManagerPanel 
      initialStatus={uiStatus}
      onStatusChange={handleStatusChange}
    />
  );
}


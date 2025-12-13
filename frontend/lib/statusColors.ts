/**
 * Centralized status color definitions
 * Ensures consistent colors across all pages:
 * - DECIDED: Green (sage-green)
 * - IN PROGRESS: Orange (warning-amber)
 */

export const STATUS_COLORS = {
  // Main status colors
  in_progress: 'bg-warning-amber/15 text-warning-amber border border-warning-amber/40',
  awaiting_execution: 'bg-warning-amber/15 text-warning-amber border border-warning-amber/40', // Waiting for execution - similar to in_progress
  decided: 'bg-sage-green/15 text-sage-green border border-sage-green/40',
  
  // Alternative opacity variants (for different contexts)
  in_progress_20: 'bg-warning-amber/20 text-warning-amber border-warning-amber/50',
  awaiting_execution_20: 'bg-warning-amber/20 text-warning-amber border-warning-amber/50',
  decided_20: 'bg-sage-green/20 text-sage-green border-sage-green/50',
  
  // Legacy status mappings (all map to decided or in_progress)
  open: 'bg-warning-amber/15 text-warning-amber border border-warning-amber/40', // Maps to in_progress
  active: 'bg-warning-amber/15 text-warning-amber border border-warning-amber/40', // Maps to in_progress
  created: 'bg-warning-amber/15 text-warning-amber border border-warning-amber/40', // Maps to in_progress
  closed: 'bg-sage-green/15 text-sage-green border border-sage-green/40', // Maps to decided
  finalized: 'bg-sage-green/15 text-sage-green border border-sage-green/40', // Maps to decided
  accepted: 'bg-sage-green/15 text-sage-green border border-sage-green/40', // Maps to decided
  completed: 'bg-sage-green/15 text-sage-green border border-sage-green/40', // Maps to decided
  archived: 'bg-shadow-grey/50 text-floral-white/70 border border-floral-white/10',
  rejected: 'bg-error-red/20 text-error-red border-error-red/50',
} as const;

/**
 * Get status color classes for a given status
 * Normalizes status to either 'in_progress' (orange) or 'decided' (green)
 */
export function getStatusColor(status: string | null | undefined, variant: 'default' | '20' = 'default'): string {
  if (!status) {
    return STATUS_COLORS.in_progress;
  }
  
  const statusLower = status.toLowerCase();
  
  // Normalize to in_progress (orange)
  if (statusLower === 'in_progress' || statusLower === 'open' || statusLower === 'active' || statusLower === 'created' || statusLower === 'OPEN' || statusLower === 'ACTIVE' || statusLower === 'CREATED') {
    return variant === '20' ? STATUS_COLORS.in_progress_20 : STATUS_COLORS.in_progress;
  }
  
  // AWAITING_EXECUTION - waiting for execution (orange, similar to in_progress)
  if (statusLower === 'awaiting_execution' || statusLower === 'AWAITING_EXECUTION') {
    return variant === '20' ? STATUS_COLORS.awaiting_execution_20 : STATUS_COLORS.awaiting_execution;
  }
  
  // Normalize to decided (green)
  if (statusLower === 'decided' || statusLower === 'closed' || statusLower === 'finalized' || statusLower === 'accepted' || statusLower === 'completed' || 
      statusLower === 'DECIDED' || statusLower === 'CLOSED' || statusLower === 'FINALIZED' || statusLower === 'ACCEPTED' || statusLower === 'COMPLETED') {
    return variant === '20' ? STATUS_COLORS.decided_20 : STATUS_COLORS.decided;
  }
  
  // Handle other statuses
  if (statusLower === 'archived') {
    return STATUS_COLORS.archived;
  }
  
  if (statusLower === 'rejected') {
    return STATUS_COLORS.rejected;
  }
  
  // Default to in_progress (orange) for unknown statuses
  return variant === '20' ? STATUS_COLORS.in_progress_20 : STATUS_COLORS.in_progress;
}

/**
 * Get status label for a given status
 */
export function getStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return 'In Progress';
  }
  
  const statusLower = status.toLowerCase();
  
  // Normalize to in_progress
  if (statusLower === 'in_progress' || statusLower === 'open' || statusLower === 'active' || statusLower === 'created' || 
      statusLower === 'OPEN' || statusLower === 'ACTIVE' || statusLower === 'CREATED') {
    return 'In Progress';
  }
  
  // AWAITING_EXECUTION
  if (statusLower === 'awaiting_execution' || statusLower === 'AWAITING_EXECUTION') {
    return 'Awaiting Execution';
  }
  
  // Normalize to decided
  if (statusLower === 'decided' || statusLower === 'closed' || statusLower === 'finalized' || statusLower === 'accepted' || statusLower === 'completed' ||
      statusLower === 'DECIDED' || statusLower === 'CLOSED' || statusLower === 'FINALIZED' || statusLower === 'ACCEPTED' || statusLower === 'COMPLETED') {
    return 'Decided';
  }
  
  // Return capitalized version for other statuses
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

/**
 * Status color map for direct lookup (for backward compatibility)
 */
export const statusColorMap: Record<string, string> = {
  in_progress: STATUS_COLORS.in_progress,
  awaiting_execution: STATUS_COLORS.awaiting_execution,
  decided: STATUS_COLORS.decided,
  open: STATUS_COLORS.in_progress,
  active: STATUS_COLORS.in_progress,
  created: STATUS_COLORS.in_progress,
  closed: STATUS_COLORS.decided,
  finalized: STATUS_COLORS.decided,
  accepted: STATUS_COLORS.decided,
  completed: STATUS_COLORS.decided,
  archived: STATUS_COLORS.archived,
  rejected: STATUS_COLORS.rejected,
};

/**
 * Status color map with 20% opacity variant
 */
export const statusColorMap20: Record<string, string> = {
  in_progress: STATUS_COLORS.in_progress_20,
  awaiting_execution: STATUS_COLORS.awaiting_execution_20,
  decided: STATUS_COLORS.decided_20,
  open: STATUS_COLORS.in_progress_20,
  active: STATUS_COLORS.in_progress_20,
  created: STATUS_COLORS.in_progress_20,
  closed: STATUS_COLORS.decided_20,
  finalized: STATUS_COLORS.decided_20,
  accepted: STATUS_COLORS.decided_20,
  completed: STATUS_COLORS.decided_20,
  archived: STATUS_COLORS.archived,
  rejected: STATUS_COLORS.rejected,
};


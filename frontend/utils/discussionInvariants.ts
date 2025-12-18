/**
 * Frontend utility for validating discussion invariants
 * 
 * This utility calls the backend API to validate discussion state invariants
 * and logs violations to the console. It should be called when discussions
 * are loaded in the UI.
 */

import { request } from '../lib/api';

export interface InvariantTestResult {
  valid: boolean;
  violations: string[];
  testResults: {
    decidedWithPending: { valid: boolean; violations: string[] } | null;
    managerEvaluationLeavesPending: { valid: boolean; violations: string[] } | null;
    singleAgentMultipleRounds: { valid: boolean; violations: string[] } | null;
  };
}

export interface AllInvariantsResult {
  valid: boolean;
  violations: string[];
  discussionResults: Array<{
    discussionId: string;
    valid: boolean;
    violations: string[];
    testResults: InvariantTestResult['testResults'] | null;
  }>;
}

/**
 * Validate invariants for a single discussion
 * 
 * @param discussionId - Discussion ID to validate
 * @returns Promise with validation results
 */
export async function validateDiscussionInvariants(discussionId: string): Promise<InvariantTestResult> {
  try {
    const result = await request<{
      success: boolean;
      valid: boolean;
      violations: string[];
      testResults: InvariantTestResult['testResults'];
    }>(`/discussions/${discussionId}/validate-invariants`);

    // Handle rate limiting - return error result when skipped
    if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
      return {
        valid: false,
        violations: ['Request was skipped due to rate limiting'],
        testResults: {
          decidedWithPending: null,
          managerEvaluationLeavesPending: null,
          singleAgentMultipleRounds: null
        }
      };
    }

    if (!result || (typeof result === 'object' && 'success' in result && !(result as any).success)) {
      throw new Error('Validation request failed');
    }

    // Type guard: result is now the expected type (not skipped)
    const validationResult = result as {
      success: boolean;
      valid: boolean;
      violations: string[];
      testResults: InvariantTestResult['testResults'];
    };

    // Log violations to console
    if (!validationResult.valid && validationResult.violations.length > 0) {
      console.error(`[Discussion Invariants] Violations detected for discussion ${discussionId}:`, validationResult.violations);
    }

    return {
      valid: validationResult.valid,
      violations: validationResult.violations,
      testResults: validationResult.testResults
    };
  } catch (error) {
    console.error(`[Discussion Invariants] Error validating discussion ${discussionId}:`, error);
    return {
      valid: false,
      violations: [`Error validating discussion: ${error instanceof Error ? error.message : 'Unknown error'}`],
      testResults: {
        decidedWithPending: null,
        managerEvaluationLeavesPending: null,
        singleAgentMultipleRounds: null
      }
    };
  }
}

/**
 * Validate invariants for all discussions
 * 
 * @returns Promise with validation results for all discussions
 */
export async function validateAllDiscussionInvariants(): Promise<AllInvariantsResult> {
  try {
    const result = await request<{
      success: boolean;
      valid: boolean;
      violations: string[];
      discussionResults: AllInvariantsResult['discussionResults'];
    }>('/discussions/validate-all-invariants');

    // Handle rate limiting - return error result when skipped
    if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
      return {
        valid: false,
        violations: ['Request was skipped due to rate limiting'],
        discussionResults: []
      };
    }

    if (!result || (typeof result === 'object' && 'success' in result && !(result as any).success)) {
      throw new Error('Validation request failed');
    }

    // Type guard: result is now the expected type (not skipped)
    const validationResult = result as {
      success: boolean;
      valid: boolean;
      violations: string[];
      discussionResults: AllInvariantsResult['discussionResults'];
    };

    // Log violations to console
    if (!validationResult.valid && validationResult.violations.length > 0) {
      console.error(`[Discussion Invariants] Violations detected across all discussions:`, validationResult.violations);
    }

    return {
      valid: validationResult.valid,
      violations: validationResult.violations,
      discussionResults: validationResult.discussionResults
    };
  } catch (error) {
    console.error(`[Discussion Invariants] Error validating all discussions:`, error);
    return {
      valid: false,
      violations: [`Error validating discussions: ${error instanceof Error ? error.message : 'Unknown error'}`],
      discussionResults: []
    };
  }
}

/**
 * Validate invariants for multiple discussions
 * 
 * @param discussionIds - Array of discussion IDs to validate
 * @returns Promise with validation results for each discussion
 */
export async function validateMultipleDiscussionInvariants(
  discussionIds: string[]
): Promise<Map<string, InvariantTestResult>> {
  const results = new Map<string, InvariantTestResult>();

  // Validate each discussion in parallel
  const promises = discussionIds.map(async (id) => {
    const result = await validateDiscussionInvariants(id);
    return { id, result };
  });

  const resolved = await Promise.allSettled(promises);

  for (const item of resolved) {
    if (item.status === 'fulfilled') {
      results.set(item.value.id, item.value.result);
    } else {
      // Handle rejected promise
      const id = discussionIds[resolved.indexOf(item)];
      results.set(id, {
        valid: false,
        violations: [`Error: ${item.reason}`],
        testResults: {
          decidedWithPending: null,
          managerEvaluationLeavesPending: null,
          singleAgentMultipleRounds: null
        }
      });
    }
  }

  return results;
}


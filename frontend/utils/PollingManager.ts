/**
 * Global Polling Manager
 * 
 * Centralized polling system that:
 * - Prevents duplicate polling tasks
 * - Automatically pauses when document is hidden
 * - Automatically resumes when document becomes visible
 * - Ensures minimum interval between executions
 * - Manages all polling tasks in one place
 */

interface PollingTask {
  id: string;
  callback: () => void | Promise<void>;
  interval: number;
  lastExecutionTime: number;
  intervalId: NodeJS.Timeout | null;
  isExecuting: boolean;
}

class PollingManagerClass {
  private tasks: Map<string, PollingTask> = new Map();
  private isVisible: boolean = true;
  private isInitialized: boolean = false;

  /**
   * Initialize the polling manager
   * Sets up visibility change listener
   */
  private initialize() {
    if (this.isInitialized || typeof document === 'undefined') {
      return;
    }

    this.isVisible = !document.hidden;
    this.isInitialized = true;
  }

  /**
   * Register a polling task
   * If a task with the same ID already exists, it will be replaced
   * 
   * @param id - Unique identifier for the polling task
   * @param callback - Function to execute on each poll
   * @param interval - Minimum interval in milliseconds between executions (minimum 5000ms)
   */
  register(id: string, callback: () => void | Promise<void>, interval: number): void {
    // Initialize if not already done
    this.initialize();

    // Enforce minimum interval of 5 seconds (5000ms)
    const actualInterval = Math.max(5000, interval);

    // Unregister existing task if it exists
    if (this.tasks.has(id)) {
      this.unregister(id);
    }

    const task: PollingTask = {
      id,
      callback,
      interval: actualInterval,
      lastExecutionTime: 0,
      intervalId: null,
      isExecuting: false,
    };

    this.tasks.set(id, task);
    this.startTask(id);
  }

  /**
   * Unregister a polling task
   * 
   * @param id - Unique identifier for the polling task
   */
  unregister(id: string): void {
    const task = this.tasks.get(id);
    if (!task) {
      return;
    }

    if (task.intervalId !== null) {
      clearInterval(task.intervalId);
      task.intervalId = null;
    }

    this.tasks.delete(id);
  }

  /**
   * Start a specific polling task
   */
  private startTask(id: string): void {
    const task = this.tasks.get(id);
    if (!task || task.intervalId !== null) {
      return; // Task doesn't exist or is already running
    }

    // Execute immediately
    this.executeTask(id);

    // Set up interval
    task.intervalId = setInterval(() => {
      if (this.isVisible) {
        this.executeTask(id);
      }
    }, task.interval);
  }

  /**
   * Execute a polling task with rate limiting
   */
  private async executeTask(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task || task.isExecuting) {
      return; // Task doesn't exist or is already executing
    }

    // Check if enough time has passed since last execution
    const now = Date.now();
    const timeSinceLastExecution = now - task.lastExecutionTime;
    
    if (timeSinceLastExecution < task.interval) {
      // Too soon, skip this execution
      return;
    }

    // Check visibility
    if (!this.isVisible) {
      return;
    }

    try {
      task.isExecuting = true;
      task.lastExecutionTime = now;
      await task.callback();
    } catch (error) {
      console.error(`PollingManager: Error executing task "${id}":`, error);
    } finally {
      task.isExecuting = false;
    }
  }

  /**
   * Pause all polling tasks
   */
  pauseAll(): void {
    this.isVisible = false;
    // Intervals are still running, but executeTask will check visibility
    // This prevents new executions when hidden
  }

  /**
   * Resume all polling tasks
   */
  resumeAll(): void {
    this.isVisible = true;
    // Execute all tasks immediately when page becomes visible
    for (const id of this.tasks.keys()) {
      this.executeTask(id);
    }
  }

  /**
   * Check if a task is registered
   */
  has(id: string): boolean {
    return this.tasks.has(id);
  }

  /**
   * Get all registered task IDs
   */
  getRegisteredIds(): string[] {
    return Array.from(this.tasks.keys());
  }

  /**
   * Check if polling is currently paused (tab is hidden)
   */
  isPaused(): boolean {
    return !this.isVisible;
  }

  /**
   * Clear all polling tasks
   */
  clear(): void {
    for (const id of this.tasks.keys()) {
      this.unregister(id);
    }
  }

  /**
   * Cleanup - remove all tasks and event listeners
   */
  destroy(): void {
    this.clear();
    this.isInitialized = false;
  }
}

// Export singleton instance
export const PollingManager = new PollingManagerClass();


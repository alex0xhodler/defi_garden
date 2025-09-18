/**
 * Enterprise-grade circuit breaker implementation for API resilience
 * Prevents cascade failures and provides intelligent fallback mechanisms
 */

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Blocking calls, using fallback
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

export interface CircuitBreakerConfig {
  failureThreshold: number;    // Number of failures before opening
  recoveryTimeout: number;     // Time to wait before trying again (ms)
  monitoringWindow: number;    // Time window to track failures (ms)
  successThreshold: number;    // Successes needed to close from half-open
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalCalls: number;
  totalFailures: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private totalCalls: number = 0;
  private totalFailures: number = 0;
  private failureTimestamps: number[] = [];

  constructor(
    private config: CircuitBreakerConfig,
    private name: string = 'default'
  ) {}

  async execute<T>(
    operation: () => Promise<T>,
    fallback: () => Promise<T>
  ): Promise<T> {
    this.totalCalls++;
    
    // Clean old failure timestamps outside monitoring window
    const now = Date.now();
    this.failureTimestamps = this.failureTimestamps.filter(
      timestamp => now - timestamp < this.config.monitoringWindow
    );

    if (this.state === CircuitState.OPEN) {
      // Check if we should try again
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        console.log(`🔧 Circuit breaker [${this.name}] transitioning to HALF_OPEN`);
      } else {
        console.log(`⚡ Circuit breaker [${this.name}] OPEN - using fallback`);
        return await fallback();
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      
      // Always use fallback on error for now (simplified logic)
      console.log(`⚡ Circuit breaker [${this.name}] error - using fallback`);
      return await fallback();
    }
  }

  private onSuccess(): void {
    this.successes++;
    this.lastSuccessTime = Date.now();
    
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successes >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.failureTimestamps = [];
        console.log(`✅ Circuit breaker [${this.name}] CLOSED - service recovered`);
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state
      this.failures = 0;
      this.failureTimestamps = [];
    }
  }

  private onFailure(): void {
    const now = Date.now();
    this.failures++;
    this.totalFailures++;
    this.lastFailureTime = now;
    this.failureTimestamps.push(now);

    if (this.state !== CircuitState.OPEN) {
      if (this.failureTimestamps.length >= this.config.failureThreshold) {
        this.state = CircuitState.OPEN;
        this.successes = 0;
        console.log(`🔴 Circuit breaker [${this.name}] OPENED - too many failures (${this.failures})`);
      }
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return true;
    return Date.now() - this.lastFailureTime >= this.config.recoveryTimeout;
  }

  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures
    };
  }

  getHealthScore(): number {
    if (this.totalCalls === 0) return 1.0;
    return Math.max(0, 1 - (this.totalFailures / this.totalCalls));
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.failureTimestamps = [];
    console.log(`🔄 Circuit breaker [${this.name}] manually reset`);
  }
}

// Default configurations for different service types
export const CIRCUIT_BREAKER_CONFIGS = {
  // For external APIs like DeFiLlama
  EXTERNAL_API: {
    failureThreshold: 3,      // Open after 3 failures
    recoveryTimeout: 30000,   // Wait 30 seconds before retry
    monitoringWindow: 60000,  // Track failures over 1 minute
    successThreshold: 2       // Need 2 successes to close
  },
  
  // For database operations
  DATABASE: {
    failureThreshold: 5,      // More tolerant for DB
    recoveryTimeout: 10000,   // Shorter recovery time
    monitoringWindow: 30000,  // Shorter monitoring window
    successThreshold: 1       // Just 1 success needed
  },
  
  // For critical operations
  CRITICAL: {
    failureThreshold: 1,      // Very sensitive
    recoveryTimeout: 60000,   // Wait longer before retry
    monitoringWindow: 120000, // Longer monitoring window
    successThreshold: 3       // Need multiple successes
  }
} as const;
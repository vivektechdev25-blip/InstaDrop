export interface CircuitBreaker {
  /** True while the protected operation should be skipped. */
  isOpen(): boolean;
  /** Opens the circuit for the cooldown; logs only on the closed->open edge. */
  trip(reason: string): void;
}

export interface CircuitBreakerOptions {
  name: string;
  cooldownMs: number;
  now?: () => number;
  log?: (message: string) => void;
}

/**
 * Deliberately minimal: no half-open probing state or failure counting.
 * The one caller trips it on a definitive "this service is refusing
 * anonymous requests" response, where a single failure is already the
 * whole signal - retrying sooner than the cooldown would just pay the
 * same latency to hear the same answer.
 */
export function createCircuitBreaker({
  name,
  cooldownMs,
  now = Date.now,
  log = (message) => console.warn(message),
}: CircuitBreakerOptions): CircuitBreaker {
  let openUntil = 0;

  return {
    isOpen: () => now() < openUntil,
    trip(reason) {
      const wasOpen = now() < openUntil;
      openUntil = now() + cooldownMs;
      if (!wasOpen) {
        log(`[circuitBreaker] "${name}" disabled for ${Math.round(cooldownMs / 60000)} min: ${reason}`);
      }
    },
  };
}

/**
 * Tests for the circuit breaker.
 *
 * Covers:
 *   - circuit opens after `failureThreshold` consecutive failures
 *   - subsequent calls throw CircuitOpenError without running the fn
 *   - circuit transitions to half-open after `openMs`
 *   - half-open + success transitions to closed
 *   - half-open + failure re-opens the circuit
 */

import { describe, it, expect, jest } from '@jest/globals';
import { CircuitBreaker, CircuitOpenError } from '../core/circuitBreaker.js';

describe('CircuitBreaker', () => {
  it('opens after 3 consecutive failures (default threshold)', async () => {
    const breaker = new CircuitBreaker('test');
    const failing = () => Promise.reject(new Error('upstream broke'));

    // 3 failures
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failing)).rejects.toThrow('upstream broke');
    }

    expect(breaker.getState()).toBe('open');

    // 4th call short-circuits with CircuitOpenError without invoking fn
    const fn = jest.fn(() => Promise.resolve('should not run'));
    await expect(breaker.execute(fn)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it('transitions open -> half-open after openMs and closes on success', async () => {
    let now = 1_000_000;
    const breaker = new CircuitBreaker('test', {
      failureThreshold: 2,
      openMs: 5_000,
      now: () => now,
    });

    await expect(breaker.execute(() => Promise.reject(new Error('a')))).rejects.toThrow();
    await expect(breaker.execute(() => Promise.reject(new Error('b')))).rejects.toThrow();
    expect(breaker.getState()).toBe('open');

    // Advance past openMs
    now += 6_000;
    expect(breaker.getState()).toBe('half-open');

    // Successful half-open call closes the circuit
    const ok = await breaker.execute(() => Promise.resolve('recovered'));
    expect(ok).toBe('recovered');
    expect(breaker.getState()).toBe('closed');
  });

  it('half-open failure re-opens the circuit', async () => {
    let now = 0;
    const breaker = new CircuitBreaker('test', {
      failureThreshold: 1,
      openMs: 1_000,
      now: () => now,
    });

    await expect(breaker.execute(() => Promise.reject(new Error('boom')))).rejects.toThrow();
    expect(breaker.getState()).toBe('open');

    now += 2_000;
    // half-open call also fails -> back to open
    await expect(breaker.execute(() => Promise.reject(new Error('still broken')))).rejects.toThrow(
      'still broken',
    );
    expect(breaker.getState()).toBe('open');
  });

  it('resets consecutive failures on a successful call', async () => {
    const breaker = new CircuitBreaker('test', { failureThreshold: 3 });

    await expect(breaker.execute(() => Promise.reject(new Error('a')))).rejects.toThrow();
    await expect(breaker.execute(() => Promise.reject(new Error('b')))).rejects.toThrow();

    // Success — counter should reset to 0
    await breaker.execute(() => Promise.resolve('ok'));

    // Two more failures — should NOT open the circuit since counter reset
    await expect(breaker.execute(() => Promise.reject(new Error('c')))).rejects.toThrow();
    await expect(breaker.execute(() => Promise.reject(new Error('d')))).rejects.toThrow();
    expect(breaker.getState()).toBe('closed');
  });

  it('exposes status with willRetryAt when open', async () => {
    let now = 1_700_000_000_000;
    const breaker = new CircuitBreaker('naver', {
      failureThreshold: 1,
      openMs: 300_000,
      now: () => now,
    });

    await expect(breaker.execute(() => Promise.reject(new Error('bad selector')))).rejects.toThrow();
    const status = breaker.getStatus();
    expect(status.state).toBe('open');
    expect(status.source).toBe('naver');
    expect(status.consecutiveFailures).toBe(1);
    expect(status.willRetryAt).toBeDefined();
    expect(status.lastError).toBe('bad selector');
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createIpRateLimiter, normalizeClientIp } from './rateLimiter';

test('normalizeClientIp extracts first IP and strips IPv4-mapped IPv6 prefix', () => {
  assert.equal(normalizeClientIp('::ffff:192.0.2.10'), '192.0.2.10');
  assert.equal(normalizeClientIp('203.0.113.5, 10.0.0.1'), '203.0.113.5');
  assert.equal(normalizeClientIp(''), 'unknown');
  assert.equal(normalizeClientIp(undefined), 'unknown');
});

test('createIpRateLimiter allows up to 5 requests per minute per IP and blocks the 6th', () => {
  const limiter = createIpRateLimiter({ maxRequests: 5, windowMs: 60_000 });
  const t0 = 1_700_000_000_000;

  for (let i = 0; i < 5; i += 1) {
    const decision = limiter.consume('203.0.113.7', t0 + i * 1000);
    assert.equal(decision.allowed, true);
    assert.equal(decision.remaining, 4 - i);
  }

  const blocked = limiter.consume('203.0.113.7', t0 + 5000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterSeconds, 55);
});

test('createIpRateLimiter tracks separate IPs independently and resets after 60 seconds', () => {
  const limiter = createIpRateLimiter({ maxRequests: 5, windowMs: 60_000 });
  const t0 = 1_700_000_000_000;

  for (let i = 0; i < 5; i += 1) {
    assert.equal(limiter.consume('198.51.100.1', t0 + i * 500).allowed, true);
  }
  assert.equal(limiter.consume('198.51.100.1', t0 + 3000).allowed, false);

  // Different IP is unaffected
  const otherIp = limiter.consume('198.51.100.2', t0 + 3000);
  assert.equal(otherIp.allowed, true);
  assert.equal(otherIp.remaining, 4);

  // Original IP becomes allowed again once the 60s window expires
  const afterWindow = limiter.consume('198.51.100.1', t0 + 60_001);
  assert.equal(afterWindow.allowed, true);
});

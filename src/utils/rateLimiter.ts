export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface IpRateLimiter {
  consume: (ip: string, now?: number) => RateLimitDecision;
  reset: () => void;
}

export function normalizeClientIp(rawIp?: string | null): string {
  if (!rawIp) return 'unknown';
  const firstHop = rawIp.split(',')[0]?.trim() ?? '';
  if (!firstHop) return 'unknown';
  if (firstHop.startsWith('::ffff:')) {
    return firstHop.slice(7);
  }
  return firstHop;
}

export function createIpRateLimiter(options?: {
  maxRequests?: number;
  windowMs?: number;
}): IpRateLimiter {
  const maxRequests = options?.maxRequests ?? 5;
  const windowMs = options?.windowMs ?? 60_000;
  const requestsByIp = new Map<string, number[]>();

  const pruneStaleEntries = (now: number) => {
    if (requestsByIp.size < 500) return;
    const cutoff = now - windowMs;
    for (const [key, timestamps] of requestsByIp.entries()) {
      const active = timestamps.filter((t) => t > cutoff);
      if (active.length === 0) {
        requestsByIp.delete(key);
      } else {
        requestsByIp.set(key, active);
      }
    }
  };

  return {
    consume(ip: string, now = Date.now()): RateLimitDecision {
      const normalizedIp = normalizeClientIp(ip);
      const cutoff = now - windowMs;
      const existing = requestsByIp.get(normalizedIp) ?? [];
      const active = existing.filter((t) => t > cutoff);

      if (active.length >= maxRequests) {
        const oldestActive = active[0] ?? now;
        const retryAfterMs = Math.max(1000, oldestActive + windowMs - now);
        requestsByIp.set(normalizedIp, active);
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
        };
      }

      active.push(now);
      requestsByIp.set(normalizedIp, active);
      pruneStaleEntries(now);

      return {
        allowed: true,
        remaining: Math.max(0, maxRequests - active.length),
        retryAfterSeconds: 0,
      };
    },
    reset() {
      requestsByIp.clear();
    },
  };
}

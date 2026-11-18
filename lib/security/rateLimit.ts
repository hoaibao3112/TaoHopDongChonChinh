/**
 * In-memory rate limiter dùng cho môi trường serverless/Edge.
 * Sử dụng Map<ip, {count, resetAt}> với sliding window.
 *
 * ⚠️ Lưu ý: In-memory chỉ hoạt động trong cùng một instance.
 * Trên Vercel serverless mỗi request có thể là instance khác nhau,
 * nhưng vẫn hữu ích để chống brute-force cơ bản trong cùng instance.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Lấy địa chỉ IP từ request headers
 */
export function getClientIp(req: { headers: { get: (key: string) => string | null } }): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') || 'unknown';
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

/**
 * Kiểm tra rate limit cho một IP
 * @param ip - Địa chỉ IP
 * @param key - Namespace (ví dụ: 'login', 'scan')
 * @param maxRequests - Số request tối đa
 * @param windowMs - Cửa sổ thời gian tính bằng milliseconds
 */
export function checkRateLimit(
  ip: string,
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const storeKey = `${key}:${ip}`;

  // Dọn dẹp entries cũ định kỳ (tránh memory leak)
  if (rateLimitStore.size > 10_000) {
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.resetAt < now) rateLimitStore.delete(k);
    }
  }

  const entry = rateLimitStore.get(storeKey);

  if (!entry || entry.resetAt < now) {
    // Window mới
    const resetAt = now + windowMs;
    rateLimitStore.set(storeKey, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAt,
      retryAfterSeconds: 0,
    };
  }

  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetAt: entry.resetAt,
    retryAfterSeconds: 0,
  };
}

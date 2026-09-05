import { describe, it, expect } from 'vitest';
import nextConfig from '../next.config.js';

describe('Automated Security Headers Test Suite', () => {
  it('verifies all mandatory HTTP security headers are configured globally', async () => {
    expect(nextConfig.headers).toBeDefined();
    if (!nextConfig.headers) throw new Error('nextConfig.headers is undefined');
    
    const headersList = await nextConfig.headers();
    expect(headersList).toBeDefined();
    expect(headersList.length).toBeGreaterThan(0);

    const globalHeadersConfig = headersList.find((h: any) => h.source === '/:path*');
    expect(globalHeadersConfig).toBeDefined();
    if (!globalHeadersConfig) throw new Error('globalHeadersConfig is undefined');

    const headersMap = new Map<string, string>();
    globalHeadersConfig.headers.forEach((header: { key: string; value: string }) => {
      headersMap.set(header.key, header.value);
    });

    // 1. Strict-Transport-Security
    expect(headersMap.has('Strict-Transport-Security')).toBe(true);
    expect(headersMap.get('Strict-Transport-Security')).toContain('max-age=63072000');

    // 2. X-Content-Type-Options
    expect(headersMap.has('X-Content-Type-Options')).toBe(true);
    expect(headersMap.get('X-Content-Type-Options')).toBe('nosniff');

    // 3. X-Frame-Options
    expect(headersMap.has('X-Frame-Options')).toBe(true);
    expect(headersMap.get('X-Frame-Options')).toBe('DENY');

    // 4. Referrer-Policy
    expect(headersMap.has('Referrer-Policy')).toBe(true);
    expect(headersMap.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');

    // 5. Permissions-Policy
    expect(headersMap.has('Permissions-Policy')).toBe(true);
    expect(headersMap.get('Permissions-Policy')).toContain('camera=()');

    // 6. Content-Security-Policy
    expect(headersMap.has('Content-Security-Policy')).toBe(true);
    expect(headersMap.get('Content-Security-Policy')).toContain("default-src 'self'");
  });
});

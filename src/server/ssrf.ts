import dns from 'node:dns/promises';
import net from 'node:net';

function isPrivateIpAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const norm = ip.toLowerCase();
    if (norm === '::1' || norm === '::') return true;
    if (norm.startsWith('fc') || norm.startsWith('fd')) return true;
    if (norm.startsWith('fe80')) return true;
    if (norm.startsWith('::ffff:')) {
      return isPrivateIpAddress(norm.replace('::ffff:', ''));
    }
    return false;
  }
  return true;
}

export async function assertSafeExternalUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL format.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http:// and https:// URLs are permitted.');
  }

  if (process.env.ALLOW_PRIVATE_CONNECTORS === 'true') {
    return parsed;
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new Error(
      `Private/local host "${host}" is blocked by SSRF policy. Set ALLOW_PRIVATE_CONNECTORS=true to permit internal endpoints.`
    );
  }

  if (net.isIP(host)) {
    if (isPrivateIpAddress(host)) {
      throw new Error(`Private IP "${host}" is blocked by SSRF policy.`);
    }
    return parsed;
  }

  try {
    const records = await dns.lookup(host, { all: true });
    for (const rec of records) {
      if (isPrivateIpAddress(rec.address)) {
        throw new Error(`Resolved private IP "${rec.address}" for "${host}" is blocked by SSRF policy.`);
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('SSRF policy')) {
      throw err;
    }
    // Allow DNS resolution errors during offline connector registration; runtime fetch will handle connectivity.
  }

  return parsed;
}

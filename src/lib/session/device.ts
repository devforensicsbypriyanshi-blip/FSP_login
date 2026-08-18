'use client';

/**
 * Device identity for the single-active-session lock (docs Part 4 §1).
 *
 * The id must survive reloads but must NOT be shared between browsers, so it
 * lives in localStorage rather than a cookie the server could set. The server
 * learns it at claim time and mirrors it into an httpOnly cookie, which is what
 * middleware actually reads — a cookie the page cannot forge on its own.
 *
 * Private-mode Safari throws on localStorage access rather than returning null,
 * hence the try/catch. Falling back to a per-tab id is the right failure mode:
 * the user stays signed in, they just look like a new device next time.
 */

const KEY = 'fsp.device.id';

let memoryId: string | null = null;

export function getDeviceId(): string {
  if (memoryId) return memoryId;

  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored) {
      memoryId = stored;
      return stored;
    }
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(KEY, fresh);
    memoryId = fresh;
    return fresh;
  } catch {
    memoryId ??= crypto.randomUUID();
    return memoryId;
  }
}

/**
 * A label a student would recognise in their device list — "Chrome on Windows",
 * not a 200-character user-agent string. Deliberately coarse: this is for
 * "was that me?", not fingerprinting.
 */
export function describeDevice(ua: string = navigator.userAgent): string {
  const browser = /\bEdg\//.test(ua)
    ? 'Edge'
    : /\bOPR\/|\bOpera/.test(ua)
      ? 'Opera'
      : /\bChrome\//.test(ua)
        ? 'Chrome'
        : /\bFirefox\//.test(ua)
          ? 'Firefox'
          : /\bSafari\//.test(ua)
            ? 'Safari'
            : 'Browser';

  const os = /\bWindows/.test(ua)
    ? 'Windows'
    : /\biPhone/.test(ua)
      ? 'iPhone'
      : /\biPad/.test(ua)
        ? 'iPad'
        : /\bAndroid/.test(ua)
          ? 'Android'
          : /\bMac OS X/.test(ua)
            ? 'Mac'
            : /\bLinux/.test(ua)
              ? 'Linux'
              : 'device';

  return `${browser} on ${os}`;
}

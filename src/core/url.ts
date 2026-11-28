export interface LinkPolicy {
  /** Prefix for relative paths, e.g. "content/". */
  baseUrl: string;
  /** Allow absolute http(s)/mailto URLs. Relative paths are always allowed. */
  allowAbsolute: boolean;
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Validates and resolves a node/edge URL. Returns `null` for anything unsafe
 * (javascript:, data:, file: ...) or for absolute URLs when they are not allowed.
 */
export function resolveUrl(raw: string | undefined, policy: LinkPolicy): string | null {
  if (!raw) return null;
  // strip control characters that browsers ignore inside schemes ("java\tscript:")
  // eslint-disable-next-line no-control-regex
  const url = raw.replace(/[\u0000-\u001f\u007f\s]+/g, (m) => (m.includes(' ') ? ' ' : '')).trim();
  if (url === '') return null;
  if (url.startsWith('//')) return policy.allowAbsolute && /^\/\/[^/]/.test(url) ? url : null;
  if (SCHEME.test(url)) {
    if (!policy.allowAbsolute) return null;
    return /^(https?|mailto):/i.test(url) ? url : null;
  }
  if (url.startsWith('/') || url.startsWith('#') || url.startsWith('?') || !policy.baseUrl) return url;
  return policy.baseUrl.replace(/\/+$/, '') + '/' + url.replace(/^\.\//, '');
}

export type OpenLinksMode = 'click' | 'dblclick' | 'ctrl-click' | 'never';

/** Short phrase for tooltips: how the visitor opens a link with the given mode ("" for `never`). */
export function describeLinkGesture(mode: OpenLinksMode, mac = false): string {
  switch (mode) {
    case 'click': return 'Click';
    case 'dblclick': return 'Double-click';
    case 'ctrl-click': return mac ? 'Cmd+click' : 'Ctrl+click';
    default: return '';
  }
}

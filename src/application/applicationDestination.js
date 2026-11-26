/**
 * Validate configured navigation only. This does not verify the receiving
 * company, loan officer, borrower intake flow or receipt of an application.
 */
export function applicationDestination(raw, pageOrigin = '') {
  if (typeof raw !== 'string' || !raw || !/^https?:\/\/[^/?#]/i.test(raw) || /[\s\p{Cc}\\]/u.test(raw)) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (!url.hostname || url.username || url.password || /^https?:\/\/[^/?#]*@/i.test(raw)) return null;

  // HTTP exists only for isolated local rehearsal, with no downgrade from a web deployment.
  if (url.protocol === 'http:') {
    const loopback = hostname => ['127.0.0.1', '[::1]', 'localhost'].includes(hostname);
    try {
      if (!loopback(url.hostname) || !loopback(new URL(pageOrigin).hostname)) return null;
    } catch { return null; }
  } else if (url.protocol !== 'https:') return null;

  if (url.hostname.replace(/\.$/, '') === 'prod.lendingpad.com' && !isLendingPadConsumerUrl(url)) return null;
  return url.href;
}

export function isLendingPadConsumerUrl(url) {
  return url.protocol === 'https:' && url.hostname === 'prod.lendingpad.com' && !url.port
    && !url.username && !url.password && !url.search && ['', '#/'].includes(url.hash)
    && /^\/[a-z0-9-]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/pos\/?$/i.test(url.pathname);
}

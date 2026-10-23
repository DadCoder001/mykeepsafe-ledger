export function fmt(n) {
  return '$' + Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function parseTags(str) {
  return String(str || '').split(',').map(t => t.trim()).filter(Boolean);
}

export function timeAgo(isoStr) {
  const ms = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function monthLabel(key) {
  try {
    return new Date(key + '-15').toLocaleString('default', { month: 'short', year: '2-digit' });
  } catch {
    return key;
  }
}

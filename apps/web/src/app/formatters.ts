export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export function formatAmount(amountCents: number, currency: string): string {
  const normalized = String(currency || "usd").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: normalized }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${normalized}`;
  }
}

export function compactId(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= 14) return normalized;
  return `${normalized.slice(0, 6)}…${normalized.slice(-6)}`;
}

export function statusClass(status: string): string {
  const normalized = status
    .toLowerCase()
    .trim()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `statusPill status-${normalized}`;
}

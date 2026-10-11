export function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Browsers send Origin on cross-origin and most same-origin POSTs. Fall back to Referer, and
 * reject the request if neither names an allowed origin.
 */
export function isAllowedOrigin(
  origin: string | undefined,
  referer: string | undefined,
  allowed: readonly string[],
): boolean {
  const candidate = origin !== undefined ? (origin === 'null' ? null : originOf(origin)) : originOf(referer);
  return candidate !== null && allowed.includes(candidate);
}

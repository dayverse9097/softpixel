export function buildHeaders(options: { apiOrigin: string; gamesOrigin: string }): string;
export function buildCaddyHeaders(options: { apiOrigin: string; gamesOrigin: string }): string;
export function loadEnvFiles(env?: Record<string, string | undefined>, files?: string[]): Record<string, string | undefined>;

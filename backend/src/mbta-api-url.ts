/** Append api_key only when set — MBTA allows unauthenticated access with lower rate limits. */
export function withMbtaKey(url: string, apiKey: string): string {
  return apiKey ? `${url}&api_key=${encodeURIComponent(apiKey)}` : url;
}

/** Integration mode: "mock" runs everything from the seed dataset; "live" hits the real APIs. */
export function integrationsMode(): "mock" | "live" {
  return process.env.INTEGRATIONS_MODE === "live" ? "live" : "mock";
}

export function hasAnthropic() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Verifies the shared secret on cron and webhook routes. */
export function checkCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization");
  const url = new URL(request.url);
  return auth === `Bearer ${secret}` || url.searchParams.get("secret") === secret;
}

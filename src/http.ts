export const USER_AGENT = "job-hunter-bot/1.0 (personal job digest; non-commercial)";
const TIMEOUT_MS = 10_000;
const ATTEMPTS = 2;

/** fetch avec User-Agent identifiable, timeout de 10 s et 2 essais. */
export async function fetchWithRetry(url: string, init: RequestInit = {}): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "User-Agent": USER_AGENT, ...init.headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} sur ${new URL(url).host}`);
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function fetchJson<T = unknown>(url: string): Promise<T> {
  const res = await fetchWithRetry(url, { headers: { Accept: "application/json" } });
  return (await res.json()) as T;
}

export async function fetchText(url: string): Promise<string> {
  return (await fetchWithRetry(url)).text();
}

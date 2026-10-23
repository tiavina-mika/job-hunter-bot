import type { Config } from "./config.js";
import { logger } from "./logger.js";
import type { Job } from "./types.js";

// Bonus optionnel : notation IA des nouvelles offres. Actif seulement si ENABLE_AI_SCORING=true
// et ANTHROPIC_API_KEY défini. En cas d'échec, le digest part sans score.
const API_URL = "https://api.anthropic.com/v1/messages";

const PROFILE =
  "Développeur fullstack (TypeScript/JavaScript, React, Next.js, React Native, Node.js), basé à Madagascar (UTC+3), " +
  "cherche un poste ou une mission remote (freelance ou CDI), fuseau horaire compatible Europe/Afrique.";

type Rating = { i: number; score: number; reason: string };

export function isScoringEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ENABLE_AI_SCORING === "true" && Boolean(env.ANTHROPIC_API_KEY);
}

export function parseRatings(text: string): Rating[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  const data: unknown = JSON.parse(match[0]);
  if (!Array.isArray(data)) return [];
  return data.filter(
    (r): r is Rating => typeof r?.i === "number" && typeof r?.score === "number" && typeof r?.reason === "string",
  );
}

/** Note les offres (une seule requête), trie par score et masque celles sous minScore. */
export async function scoreJobs(
  jobs: Job[],
  config: Config,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Job[]> {
  const batch = jobs.slice(0, config.scoring.maxJobsScored);
  const rest = jobs.slice(config.scoring.maxJobsScored);
  try {
    const list = batch
      .map((j, i) => `${i}. ${j.title} | ${j.company} | ${j.location ?? ""} | ${(j.description ?? "").slice(0, 400)}`)
      .join("\n");
    const res = await fetchImpl(API_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: config.scoring.model,
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content:
              `Profil : ${PROFILE}\n\nNote chaque offre de 0 à 10 selon l'adéquation avec ce profil, avec une phrase de justification en français. ` +
              `Réponds uniquement par un tableau JSON : [{"i":0,"score":7,"reason":"..."}].\n\n${list}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = body.content?.find((c) => c.type === "text")?.text ?? "";
    const ratings = new Map(parseRatings(text).map((r) => [r.i, r]));
    if (ratings.size === 0) throw new Error("réponse non exploitable");

    const scored = batch
      .map((j, i) => {
        const r = ratings.get(i);
        return r ? { ...j, score: r.score, scoreReason: r.reason } : j;
      })
      .filter((j) => j.score === undefined || j.score >= config.scoring.minScore)
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    logger.info(`Scoring IA : ${scored.length}/${batch.length} offres gardées (minScore ${config.scoring.minScore})`);
    return [...scored, ...rest];
  } catch (err) {
    logger.warn(`Scoring IA indisponible, digest envoyé sans score (${err instanceof Error ? err.message : "erreur"})`);
    return jobs;
  }
}

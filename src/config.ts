import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const SOURCE_NAMES = ["remoteok", "remotive", "weworkremotely", "himalayas", "hackernews", "portaljob"] as const;

const configSchema = z.object({
  include: z.array(z.string().min(1)).min(1),
  exclude: z.array(z.string().min(1)).default([]),
  remoteOnly: z.boolean().default(true),
  maxAgeDays: z.number().positive().default(7),
  sendEmptyDigest: z.boolean().default(false),
  excludeLocations: z.array(z.string().min(1)).default([]),
  // Lieux gardés même s'ils ne sont pas remote (ex. offres locales à Madagascar).
  alwaysKeepLocations: z.array(z.string().min(1)).default([]),
  scoring: z
    .object({
      minScore: z.number().min(0).max(10).default(5),
      maxJobsScored: z.number().int().positive().default(30),
      model: z.string().default("claude-haiku-5-5"),
    })
    .default({ minScore: 5, maxJobsScored: 30, model: "claude-haiku-5-5" }),
  sources: z.record(z.string(), z.boolean()),
});

export type Config = z.infer<typeof configSchema>;

const envSchema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI manquant"),
  GMAIL_USER: z.string().email("GMAIL_USER doit être une adresse email"),
  // Google affiche le code par groupes de 4 caractères séparés par des espaces : on les retire.
  GMAIL_APP_PASSWORD: z
    .string()
    .transform((s) => s.replace(/\s+/g, ""))
    .pipe(z.string().min(1, "GMAIL_APP_PASSWORD manquant")),
  EMAIL_TO: z.string().email("EMAIL_TO doit être une adresse email"),
  ENABLE_AI_SCORING: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseConfig(raw: unknown): Config {
  const result = configSchema.safeParse(raw);
  if (!result.success) throw new Error(`config.json invalide : ${z.prettifyError(result.error)}`);
  return result.data;
}

export function loadConfig(path = fileURLToPath(new URL("../config.json", import.meta.url))): Config {
  return parseConfig(JSON.parse(readFileSync(path, "utf8")));
}

/**
 * Valide les variables d'environnement. Le message d'erreur ne contient que les noms
 * des variables fautives, jamais leurs valeurs. En dry-run (requireAll=false), tout est optionnel.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env, opts: { requireAll: boolean } = { requireAll: true }): Partial<Env> {
  if (!opts.requireAll) {
    const partial = envSchema.partial().safeParse(source);
    return partial.success ? partial.data : {};
  }
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((i) => `${i.path.join(".")} (${i.message})`))];
    throw new Error(`Variables d'environnement invalides : ${names.join(", ")}`);
  }
  return result.data;
}

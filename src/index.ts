import { connectStore, describeMongoError, type JobStore } from "./dedupe.js";
import { loadConfig, loadEnv, type Env } from "./config.js";
import { filterJobs } from "./filter.js";
import { logger } from "./logger.js";
import { buildDigest, sendDigest } from "./notify.js";
import { isScoringEnabled, scoreJobs } from "./score.js";
import { activeSources } from "./sources/index.js";
import type { Job } from "./types.js";

async function main(): Promise<number> {
  try {
    process.loadEnvFile(); // charge .env en local ; absent sur GitHub Actions (variables déjà injectées)
  } catch {
    // pas de fichier .env : normal en CI
  }

  const dryRun = process.argv.includes("--dry-run");
  const config = loadConfig();
  const env = loadEnv(process.env, { requireAll: !dryRun });
  if (dryRun) logger.info("Mode --dry-run : aucun email envoyé, aucune écriture en base");

  // 1. Collecte en parallèle : une source qui plante n'empêche pas les autres.
  const sources = activeSources(config);
  const results = await Promise.allSettled(sources.map((s) => s.fetch()));
  const collected: Job[] = [];
  let failures = 0;
  results.forEach((r, i) => {
    const name = sources[i]?.name ?? "?";
    if (r.status === "fulfilled") {
      logger.info(`[${name}] ${r.value.length} offres récupérées`);
      collected.push(...r.value);
    } else {
      failures++;
      logger.error(`[${name}] échec : ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    }
  });
  if (sources.length === 0 || failures === sources.length) {
    logger.error("Toutes les sources ont échoué (ou aucune n'est active)");
    return 1;
  }

  // 2. Filtre
  const filtered = filterJobs(collected, config);
  logger.info(`${filtered.length} offres après filtre (sur ${collected.length})`);

  // 3. Déduplication (lecture seule en dry-run)
  let store: JobStore | undefined;
  let fresh = filtered;
  if (env.MONGODB_URI) {
    try {
      store = await connectStore(env.MONGODB_URI);
      fresh = await store.filterNew(filtered);
    } catch (err) {
      logger.error(`MongoDB indisponible : ${describeMongoError(err)}`);
      if (!dryRun) return 1;
      logger.warn("Dry-run : déduplication ignorée");
    }
  } else {
    logger.warn("MONGODB_URI absent : déduplication ignorée (dry-run uniquement)");
  }
  logger.info(`${fresh.length} nouvelles offres`);

  try {
    // 4. Scoring IA optionnel
    if (fresh.length > 0 && isScoringEnabled()) {
      fresh = await scoreJobs(fresh, config, process.env.ANTHROPIC_API_KEY ?? "");
    }

    if (fresh.length === 0 && !config.sendEmptyDigest) {
      logger.info("Aucune nouvelle offre : pas d'email");
      return 0;
    }

    if (dryRun) {
      const digest = buildDigest(fresh);
      console.log(`\n--- ${digest.subject} ---\n${digest.text}`);
      logger.info("Dry-run terminé");
      return 0;
    }

    // 5. Envoi puis seulement ensuite marquage "vu"
    try {
      await sendDigest(fresh, env as Env);
      logger.info(`Email envoyé (${fresh.length} offres)`);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : "Échec d'envoi de l'email");
      return 1;
    }
    await store?.markSeen(fresh);
    logger.info("Offres enregistrées comme vues");
    return 0;
  } finally {
    await store?.close();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    logger.error(err instanceof Error ? err.message : "Erreur inattendue");
    process.exitCode = 1;
  });

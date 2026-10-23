import { MongoClient, type Collection } from "mongodb";
import type { Job } from "./types.js";

const TTL_SECONDS = 90 * 24 * 3600;

type SeenDoc = { id: string; firstSeenAt: Date };

export type JobStore = {
  /** Ne garde que les offres jamais vues (et sans doublon interne). */
  filterNew: (jobs: Job[]) => Promise<Job[]>;
  /** Marque les offres comme vues. À appeler APRÈS un envoi d'email réussi. */
  markSeen: (jobs: Job[]) => Promise<void>;
  close: () => Promise<void>;
};

export async function connectStore(uri: string): Promise<JobStore> {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  const col: Collection<SeenDoc> = client.db().collection("seen_jobs");
  await col.createIndex({ id: 1 }, { unique: true });
  await col.createIndex({ firstSeenAt: 1 }, { expireAfterSeconds: TTL_SECONDS });

  return {
    async filterNew(jobs) {
      const unique = [...new Map(jobs.map((j) => [j.id, j])).values()];
      if (unique.length === 0) return [];
      const seen = await col.find({ id: { $in: unique.map((j) => j.id) } }, { projection: { id: 1 } }).toArray();
      const seenIds = new Set(seen.map((d) => d.id));
      return unique.filter((j) => !seenIds.has(j.id));
    },
    async markSeen(jobs) {
      if (jobs.length === 0) return;
      const now = new Date();
      await col.bulkWrite(
        jobs.map((j) => ({
          updateOne: { filter: { id: j.id }, update: { $setOnInsert: { id: j.id, firstSeenAt: now } }, upsert: true },
        })),
        { ordered: false },
      );
    },
    close: () => client.close(),
  };
}

/** Message d'erreur MongoDB lisible, avec une piste de résolution pour les cas courants. Jamais l'URI. */
export function describeMongoError(err: unknown): string {
  const msg = err instanceof Error ? (err.message.split("\n")[0] ?? "") : "erreur inconnue";
  let hint = "";
  if (/tlsv1 alert|ssl alert|ECONNREFUSED|ETIMEDOUT|Server selection timed out/i.test(msg)) {
    hint = "Vérifie Atlas > Network Access (autoriser 0.0.0.0/0 pour GitHub Actions) et que le cluster n'est pas en pause.";
  } else if (/auth|bad auth|credentials/i.test(msg)) {
    hint = "Vérifie l'utilisateur et le mot de passe de MONGODB_URI (encode les caractères spéciaux, ex. @ -> %40).";
  } else if (/ENOTFOUND|querySrv|Invalid (scheme|connection string)/i.test(msg)) {
    hint = "Vérifie le format de MONGODB_URI (mongodb+srv://...).";
  }
  return hint ? `${msg} — ${hint}` : msg;
}

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

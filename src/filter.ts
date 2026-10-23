import type { Config } from "./config.js";
import type { Job } from "./types.js";

const REMOTE_HINT = /remote|worldwide|anywhere|global|distributed|work from home|africa|europe|emea|\butc\b|\bgmt\b|async/i;
const DAY_MS = 86_400_000;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Mot-clé entier, insensible à la casse ("react" ne matche pas "reactive"). */
export function matchesKeyword(text: string, keyword: string): boolean {
  return new RegExp(`(?<![a-z0-9])${escapeRegex(keyword.trim())}(?![a-z0-9])`, "i").test(text);
}

function searchableText(job: Job): string {
  return [job.title, job.description ?? "", ...(job.tags ?? [])].join("\n");
}

export function isRemote(job: Job): boolean {
  const location = job.location?.trim();
  if (!location) return true; // lieu non précisé : on garde
  return REMOTE_HINT.test(location) || REMOTE_HINT.test(job.title) || (job.tags ?? []).some((t) => /remote/i.test(t));
}

export function isFresh(job: Job, maxAgeDays: number, now = new Date()): boolean {
  if (!job.date) return true; // date inconnue : on garde
  const t = Date.parse(job.date);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t <= maxAgeDays * DAY_MS;
}

export function filterJobs(jobs: Job[], config: Config, now = new Date()): Job[] {
  return jobs.filter((job) => {
    const text = searchableText(job);
    if (!config.include.some((k) => matchesKeyword(text, k))) return false;
    if (config.exclude.some((k) => matchesKeyword(text, k))) return false;
    const loc = (job.location ?? "").toLowerCase();
    const keepLocal = loc !== "" && config.alwaysKeepLocations.some((l) => loc.includes(l.toLowerCase()));
    if (config.remoteOnly && !keepLocal && !isRemote(job)) return false;
    if (loc && config.excludeLocations.some((l) => loc.includes(l.toLowerCase()))) return false;
    return isFresh(job, config.maxAgeDays, now);
  });
}

import { fetchJson } from "../http.js";
import { htmlToText, toIso } from "../text.js";
import type { Job, Source } from "../types.js";

// API publique gratuite : https://himalayas.app/docs/remote-jobs-api
// Endpoint de recherche (20 résultats par page). Conditions : utiliser applicationLink pour postuler
// et créditer Himalayas avec un lien visible (fait dans le digest).
const QUERIES = ["react", "typescript", "node.js", "full stack"];
const searchUrl = (q: string) => `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}&sort=recent`;

type HimalayasItem = {
  title?: string;
  companyName?: string;
  applicationLink?: string;
  guid?: string;
  pubDate?: number;
  description?: string;
  excerpt?: string;
  categories?: string[];
  locationRestrictions?: string[];
};

export function parseHimalayas(raw: unknown): Job[] {
  const jobs = (raw as { jobs?: HimalayasItem[] } | null)?.jobs;
  if (!Array.isArray(jobs)) return [];
  return jobs
    .filter((j) => j.title && (j.guid || j.applicationLink))
    .map((j) => ({
      id: `himalayas:${j.guid ?? j.applicationLink}`,
      title: j.title ?? "",
      company: j.companyName ?? "",
      url: j.applicationLink ?? j.guid ?? "",
      source: "himalayas",
      date: toIso(j.pubDate, "s"),
      description: htmlToText(j.description) || j.excerpt || "",
      tags: j.categories ?? [],
      location: j.locationRestrictions?.length ? j.locationRestrictions.join(", ") : "Worldwide",
    }));
}

export const himalayas: Source = {
  name: "himalayas",
  fetch: async () => {
    const results = await Promise.allSettled(QUERIES.map(async (q) => parseHimalayas(await fetchJson(searchUrl(q)))));
    const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (ok.length === 0) throw new Error("toutes les requêtes Himalayas ont échoué");
    return [...new Map(ok.flat().map((j) => [j.id, j])).values()];
  },
};

import { fetchJson } from "../http.js";
import { htmlToText, toIso } from "../text.js";
import type { Job, Source } from "../types.js";

// API publique : https://remotive.com/api/remote-jobs (doc : github.com/remotive-com/remote-jobs-api).
// Conditions : lier vers l'URL Remotive et citer Remotive ; max ~4 appels/jour (on en fait 1) ;
// offres retardées de 24 h ; ne pas republier ailleurs (ici : digest privé envoyé à soi-même).
// NB : le robots.txt de remotive.com liste /api/*, mais l'API est documentée comme publique par Remotive.
const URL_API = "https://remotive.com/api/remote-jobs?category=software-dev";

type RemotiveItem = {
  id?: number;
  url?: string;
  title?: string;
  company_name?: string;
  tags?: string[];
  publication_date?: string;
  candidate_required_location?: string;
  description?: string;
};

export function parseRemotive(raw: unknown): Job[] {
  const jobs = (raw as { jobs?: RemotiveItem[] } | null)?.jobs;
  if (!Array.isArray(jobs)) return [];
  return jobs
    .filter((j) => j.id && j.title && j.url)
    .map((j) => ({
      id: `remotive:${j.id}`,
      title: j.title ?? "",
      company: j.company_name ?? "",
      url: j.url ?? "",
      source: "remotive",
      date: toIso(j.publication_date),
      description: htmlToText(j.description),
      tags: (j.tags ?? []).map((t) => t.trim()).filter(Boolean),
      location: j.candidate_required_location?.trim() ?? "",
    }));
}

export const remotive: Source = {
  name: "remotive",
  fetch: async () => parseRemotive(await fetchJson(URL_API)),
};

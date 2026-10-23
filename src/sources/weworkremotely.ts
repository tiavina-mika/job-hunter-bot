import Parser from "rss-parser";
import { fetchText } from "../http.js";
import { htmlToText, toIso } from "../text.js";
import type { Job, Source } from "../types.js";

// Flux RSS officiels par catégorie (robots.txt : Allow: /). Liens et mention de la source dans le digest.
const FEEDS = [
  "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss",
];

type WwrItem = {
  title?: string;
  link?: string;
  guid?: string;
  pubDate?: string;
  content?: string;
  region?: string;
  skills?: string;
  category?: string;
};

const parser = new Parser<Record<string, never>, WwrItem>({
  customFields: { item: ["region", "skills", "category"] },
});

/** Titre WWR = "Entreprise: Intitulé" */
function splitTitle(raw: string): { company: string; title: string } {
  const i = raw.indexOf(": ");
  return i > 0 ? { company: raw.slice(0, i).trim(), title: raw.slice(i + 2).trim() } : { company: "", title: raw.trim() };
}

export async function parseWwrFeed(xml: string): Promise<Job[]> {
  const feed = await parser.parseString(xml);
  return feed.items
    .filter((it) => it.title && (it.link || it.guid))
    .map((it) => {
      const { company, title } = splitTitle(it.title ?? "");
      const url = it.link ?? it.guid ?? "";
      return {
        id: `weworkremotely:${it.guid ?? url}`,
        title,
        company,
        url,
        source: "weworkremotely",
        date: toIso(it.pubDate),
        description: htmlToText(it.content),
        tags: [it.category, ...(it.skills ?? "").split(",")].map((t) => t?.trim() ?? "").filter(Boolean),
        location: it.region?.trim() ?? "",
      };
    });
}

export const weworkremotely: Source = {
  name: "weworkremotely",
  fetch: async () => {
    const results = await Promise.allSettled(FEEDS.map(async (url) => parseWwrFeed(await fetchText(url))));
    const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (ok.length === 0) throw new Error("tous les flux WWR ont échoué");
    return [...new Map(ok.flat().map((j) => [j.id, j])).values()];
  },
};

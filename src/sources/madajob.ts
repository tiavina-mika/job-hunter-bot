import { load } from "cheerio";
import { fetchText } from "../http.js";
import { toIso } from "../text.js";
import type { Job, Source } from "../types.js";

// Madajob (https://www.madajob.mg/jobs) : page Next.js rendue côté serveur, une <article> par offre.
// Pas de robots.txt (404). Les mentions légales interdisent la reproduction du contenu sans autorisation :
// on ne garde donc que titre, employeur, lieu, secteur, contrat et lien (aucune description), 2 pages par jour.
const BASE = "https://www.madajob.mg";
const PAGES = ["/jobs", "/jobs?q=d%C3%A9veloppeur"];

export function parseMadajob(html: string): Job[] {
  const $ = load(html);
  const jobs = new Map<string, Job>();

  $("article").each((_, el) => {
    const card = $(el);
    const link = card.find("h3 a[href^='/jobs/']").first();
    const href = link.attr("href");
    const title = link.text().trim();
    if (!href || !title) return;
    const slug = href.replace("/jobs/", "");
    // Les spans de la dernière ligne : ville, secteur, contrat.
    const [city, sector, contract] = card
      .find("p")
      .first()
      .next()
      .children()
      .map((_, s) => $(s).text().trim())
      .get();

    jobs.set(`madajob:${slug}`, {
      id: `madajob:${slug}`,
      title,
      company: card.find("p").first().text().trim(),
      url: `${BASE}${href}`,
      source: "madajob",
      date: toIso(card.find("time").attr("datetime")),
      tags: [sector, contract].filter((t): t is string => Boolean(t)),
      location: city ?? "",
    });
  });

  return [...jobs.values()];
}

export const madajob: Source = {
  name: "madajob",
  fetch: async () => {
    const results = await Promise.allSettled(PAGES.map(async (p) => parseMadajob(await fetchText(`${BASE}${p}`))));
    const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (ok.length === 0) throw new Error("toutes les pages Madajob ont échoué");
    return [...new Map(ok.flat().map((j) => [j.id, j])).values()];
  },
};

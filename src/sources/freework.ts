import { load, type Cheerio } from "cheerio";
import type { Element } from "domhandler";
import { fetchText } from "../http.js";
import type { Job, Source } from "../types.js";

// Free-Work (https://www.free-work.com/fr/tech-it/jobs) : CDI et missions freelance IT en France, page rendue côté serveur.
// robots.txt : pour les agents génériques seuls /login, /logout et /fw-deals sont interdits. Leurs conditions
// ne contiennent pas d'interdiction d'accès automatisé. On reste à 4 pages de liste par jour (une par mot-clé).
const BASE = "https://www.free-work.com";
const QUERIES = ["", "react", "typescript", "node"];
const pageUrl = (q: string) => `${BASE}/fr/tech-it/jobs${q ? `?query=${encodeURIComponent(q)}` : ""}`;

const JOB_LINK = "a[href*='/job-mission/']";
const CONTRACT = /^(Freelance|CDI|CDD|Stage|Alternance|Portage|Intérim)$/i;
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** "23/10/2026" -> ISO (minuit UTC) */
export function parseFrenchDate(text: string): string {
  const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z` : "";
}

/** Champ "Télétravail" : "Télétravail partiel" = hybride, "Télétravail 100%" = full remote, absent = sur site. */
function workMode(leaves: string[]): string {
  const i = leaves.indexOf("Télétravail");
  if (i < 0) return "Sur site";
  const value = leaves[i + 1] ?? "";
  if (/100|total|complet|full/i.test(value)) return "Full remote";
  return "Hybride";
}

export function parseFreeWork(html: string): Job[] {
  const $ = load(html);
  $("script, style, svg").remove();
  const jobs = new Map<string, Job>();

  $(JOB_LINK).each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const slug = href.split("/").filter(Boolean).pop();
    if (!slug || jobs.has(`freework:${slug}`)) return;

    // Carte = plus grand ancêtre qui ne contient qu'une seule offre.
    let card = $(el) as Cheerio<Element>;
    while (card.parent().length && new Set(card.parent().find(JOB_LINK).map((_, a) => $(a).attr("href")).get()).size === 1) {
      card = card.parent() as Cheerio<Element>;
    }

    const title = squash(card.find("h2 a").first().text());
    if (!title) return;
    const leaves = card
      .find("*")
      .filter((_, e) => $(e).children().length === 0)
      .map((_, e) => squash($(e).text()))
      .get()
      .filter(Boolean);

    const dateIdx = leaves.findIndex((l) => /^\d{2}\/\d{2}\/\d{4}$/.test(l));
    const afterDate = leaves[dateIdx + 1] ?? "";
    const company = dateIdx >= 0 && afterDate.length <= 80 && !title.startsWith(afterDate.slice(0, 20)) ? afterDate : "";
    const descIdx = dateIdx + 2;
    const description = dateIdx >= 0 && leaves[descIdx] && leaves[descIdx] !== "Voir cette offre" ? leaves[descIdx].slice(0, 500) : "";
    const contract = leaves.find((l) => CONTRACT.test(l)) ?? "";
    const city = leaves[leaves.indexOf("Lieu") + 1] ?? "";
    // Technos : entre le titre et la date, hors contrat et "+N".
    const titleIdx = leaves.findIndex((l) => l === title.slice(0, 40) || title.startsWith(l));
    const tags = leaves
      .slice(titleIdx + 1, dateIdx > 0 ? dateIdx : titleIdx + 1)
      .filter((l) => !CONTRACT.test(l) && !/^\+\d+$/.test(l));

    jobs.set(`freework:${slug}`, {
      id: `freework:${slug}`,
      title,
      company,
      url: `${BASE}${href}`,
      source: "freework",
      date: dateIdx >= 0 ? parseFrenchDate(leaves[dateIdx] ?? "") : "",
      description: [contract, description].filter(Boolean).join(" · "),
      tags: [...new Set(tags)],
      location: [city, workMode(leaves)].filter(Boolean).join(" · "),
    });
  });

  return [...jobs.values()];
}

export const freework: Source = {
  name: "freework",
  fetch: async () => {
    const results = await Promise.allSettled(QUERIES.map(async (q) => parseFreeWork(await fetchText(pageUrl(q)))));
    const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (ok.length === 0) throw new Error("toutes les pages Free-Work ont échoué");
    return [...new Map(ok.flat().map((j) => [j.id, j])).values()];
  },
};

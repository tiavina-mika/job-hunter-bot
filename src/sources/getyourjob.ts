import { load, type Cheerio } from "cheerio";
import type { Element } from "domhandler";
import { fetchText } from "../http.js";
import type { Job, Source } from "../types.js";

// GetYourJob (https://getyourjob.pro/offers) : page Next.js rendue côté serveur, les offres sont dans le HTML.
// robots.txt : /offers autorisé (seul /api/ est interdit, on ne l'utilise pas). Les CGU interdisent l'extraction
// MASSIVE : on reste donc à quelques pages de liste publiques par jour (une par mot-clé), sans /api/, sans compte.
// Site orienté France : la grande majorité des offres sont "Hybride" / "Sur site" et seront écartées par le filtre remote.
const BASE = "https://getyourjob.pro";
const QUERIES = ["", "react", "typescript", "node"];
const pageUrl = (q: string) => `${BASE}/offers${q ? `?q=${encodeURIComponent(q)}` : ""}`;

const HOUR_MS = 3_600_000;
const UNIT_MS: Record<string, number> = { min: 60_000, h: HOUR_MS, j: 24 * HOUR_MS, sem: 7 * 24 * HOUR_MS, mois: 30 * 24 * HOUR_MS, an: 365 * 24 * HOUR_MS };

/** "Aujourd'hui", "Hier", "il y a 3 j", "il y a 2 sem" -> ISO ; chaîne vide si inconnu. */
export function parseRelativeDate(text: string, now = new Date()): string {
  const t = text.trim().toLowerCase();
  if (/^aujourd/.test(t)) return now.toISOString();
  if (t === "hier") return new Date(now.getTime() - 24 * HOUR_MS).toISOString();
  const m = t.match(/il y a\s+(\d+)\s*(min|h|j|sem|mois|an)/);
  const unit = m?.[2] ? UNIT_MS[m[2]] : undefined;
  return m && unit ? new Date(now.getTime() - Number(m[1]) * unit).toISOString() : "";
}

const JOB_LINK = "h3 > a[href^='/jobs/']";

export function parseGetYourJob(html: string, now = new Date()): Job[] {
  const $ = load(html);
  $("svg, script, style").remove();
  const jobs = new Map<string, Job>();

  $(JOB_LINK).each((_, el) => {
    const link = $(el);
    const href = link.attr("href") ?? "";
    const title = link.text().trim();
    if (!href || !title) return;
    const uuid = href.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)?.[0];
    const id = `getyourjob:${uuid ?? href.replace("/jobs/", "")}`;
    if (jobs.has(id)) return; // la page contient chaque carte deux fois (mobile + desktop)

    // Carte = plus grand ancêtre qui ne contient qu'une seule offre.
    const h3 = link.parent();
    let card: Cheerio<Element> = h3;
    while (card.parent().length && new Set(card.parent().find(JOB_LINK).map((_, a) => $(a).attr("href")).get()).size === 1) {
      card = card.parent() as Cheerio<Element>;
    }

    const [contract, level] = h3.next().children().map((_, c) => $(c).text().trim()).get();
    const badge = card.find("[data-remote-badge]").first();
    const mode = badge.attr("data-remote-badge") ?? "";
    const workMode = mode.startsWith("FULL_REMOTE") ? "Full remote" : badge.clone().children().remove().end().text().trim() || badge.text().trim();
    const city = badge.parent().parent().children().first().text().trim();
    const salary = card.find("span").filter((_, s) => /€/.test($(s).text())).first().text().trim();
    const company = card.find("a[href^='/companies/']").first().text().trim();
    const posted = card.find("span").filter((_, s) => /^(aujourd|hier|il y a)/i.test($(s).text().trim())).first().text();

    // Pastilles de technos : le bloc dont les enfants sont des <div> feuilles (hors contrat/niveau).
    const tagBlock = card
      .find("div")
      .filter((_, d) => {
        const kids = $(d).children();
        return kids.length >= 2 && kids.toArray().every((k) => k.tagName === "div" && $(k).children().length === 0) && !$(d).is(h3.next());
      })
      .first();
    const tags = tagBlock.children().map((_, t) => $(t).text().trim()).get().filter((t) => t && !/^\+\d+$/.test(t));

    jobs.set(id, {
      id,
      title,
      company,
      url: `${BASE}${href}`,
      source: "getyourjob",
      date: parseRelativeDate(posted, now),
      description: [contract, level, salary].filter(Boolean).join(" · "),
      tags,
      location: [city, workMode].filter(Boolean).join(" · "),
    });
  });

  return [...jobs.values()];
}

export const getyourjob: Source = {
  name: "getyourjob",
  fetch: async () => {
    const results = await Promise.allSettled(QUERIES.map(async (q) => parseGetYourJob(await fetchText(pageUrl(q)))));
    const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (ok.length === 0) throw new Error("toutes les pages GetYourJob ont échoué");
    return [...new Map(ok.flat().map((j) => [j.id, j])).values()];
  },
};

import { load } from "cheerio";
import { fetchText } from "../http.js";
import { htmlToText } from "../text.js";
import type { Job, Source } from "../types.js";

// PortalJob Madagascar (site Laravel + Inertia). robots.txt : Allow: / pour les agents génériques.
//
// ÉTAT RÉEL (vérifié le 2026-10-23) : la page /emploi/liste ne contient PAS les offres dans son HTML initial.
// Elles sont chargées côté client via POST /api/emploi/annonces, qui répond 403 "Access not allowed"
// à un client sans session. On ne contourne pas cette protection : cette source reste donc désactivée
// par défaut (config.json -> sources.portaljob = false). Le parseur ci-dessous lit l'objet Inertia
// (attribut data-page) et un éventuel HTML rendu côté serveur, et s'activera tout seul si le site
// se met à embarquer les annonces dans la page.
const BASE = "https://www.portaljob-madagascar.com";
const LIST_URL = `${BASE}/emploi/liste`;

type Annonce = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

function absolute(href: string): string {
  try {
    return new URL(href, BASE).toString();
  } catch {
    return "";
  }
}

function fromAnnonce(a: Annonce): Job | null {
  const id = str(a.id) || str(a.slug);
  const title = str(a.titre) || str(a.title) || str(a.poste);
  const href = str(a.url) || (str(a.slug) ? `/emploi/${str(a.slug)}` : "");
  if (!id || !title || !href) return null;
  return {
    id: `portaljob:${id}`,
    title,
    company: str(a.entreprise) || str(a.societe) || str(a.company),
    url: absolute(href),
    source: "portaljob",
    date: str(a.date_publication) || str(a.created_at) || "",
    description: htmlToText(str(a.description)),
    tags: [],
    location: str(a.ville) || str(a.lieu) || "",
  };
}

/** Extrait les annonces depuis le HTML : props Inertia d'abord, puis cartes HTML éventuelles. */
export function parsePortalJob(html: string): Job[] {
  const $ = load(html);
  const jobs: Job[] = [];

  const page = $("[data-page]").attr("data-page");
  if (page) {
    try {
      const props = (JSON.parse(page) as { props?: { search?: unknown; annonces?: unknown } }).props ?? {};
      for (const candidate of [props.annonces, props.search]) {
        const list = Array.isArray(candidate) ? candidate : ((candidate as { data?: unknown } | undefined)?.data as unknown);
        if (Array.isArray(list)) {
          for (const a of list) {
            const job = fromAnnonce(a as Annonce);
            if (job) jobs.push(job);
          }
        }
      }
    } catch {
      // data-page illisible : on retombe sur le HTML
    }
  }

  $("a[href*='/emploi/'][data-annonce-id], article.annonce a[href*='/emploi/']").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const title = $(el).text().trim();
    const id = $(el).attr("data-annonce-id") ?? href;
    if (title && href) {
      jobs.push({ id: `portaljob:${id}`, title, company: "", url: absolute(href), source: "portaljob", date: "", location: "" });
    }
  });

  return [...new Map(jobs.map((j) => [j.id, j])).values()];
}

export const portaljob: Source = {
  name: "portaljob",
  fetch: async () => parsePortalJob(await fetchText(LIST_URL)),
};

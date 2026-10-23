import { load } from "cheerio";

const MAX_LEN = 5000;

/** Convertit du HTML en texte brut (tronqué) pour le filtrage et l'affichage. */
export function htmlToText(html: string | undefined | null): string {
  if (!html) return "";
  const $ = load(`<div>${html.replace(/<br\s*\/?>|<\/p>|<\/li>/gi, "\n")}</div>`);
  return $("div").text().replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim().slice(0, MAX_LEN);
}

/** Date quelconque -> ISO 8601, chaîne vide si invalide. Sans fuseau, on suppose UTC. */
export function toIso(input: string | number | undefined | null, unit: "ms" | "s" = "ms"): string {
  if (input === undefined || input === null || input === "") return "";
  let d: Date;
  if (typeof input === "number") d = new Date(unit === "s" ? input * 1000 : input);
  else d = new Date(/(Z|[+-]\d\d:?\d\d)$/.test(input) || /GMT|UTC/.test(input) ? input : `${input}Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

import { fetchJson } from "../http.js";
import { htmlToText, toIso } from "../text.js";
import type { Job, Source } from "../types.js";

// API publique : https://remoteok.com/api (le 1er élément est un bloc "legal", à ignorer).
// Conditions : citer Remote OK et lier vers l'URL d'origine (fait dans le digest).
const URL_API = "https://remoteok.com/api";

type RemoteOkItem = {
  id?: string | number;
  slug?: string;
  position?: string;
  company?: string;
  url?: string;
  date?: string;
  epoch?: number;
  tags?: string[];
  location?: string;
  description?: string;
};

export function parseRemoteOk(raw: unknown): Job[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RemoteOkItem[])
    .filter((j) => j && j.id && j.position && j.url)
    .map((j) => ({
      id: `remoteok:${j.id}`,
      title: j.position ?? "",
      company: j.company ?? "",
      url: j.url ?? "",
      source: "remoteok",
      date: toIso(j.date) || toIso(j.epoch, "s"),
      description: htmlToText(j.description),
      tags: j.tags ?? [],
      location: j.location?.trim() ?? "",
    }));
}

export const remoteok: Source = {
  name: "remoteok",
  fetch: async () => parseRemoteOk(await fetchJson(URL_API)),
};

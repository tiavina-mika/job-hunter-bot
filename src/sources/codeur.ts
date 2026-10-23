import Parser from "rss-parser";
import { fetchText } from "../http.js";
import { htmlToText, toIso } from "../text.js";
import type { Job, Source } from "../types.js";

// Flux RSS officiel de Codeur.com (missions freelance de clients francophones) : https://www.codeur.com/projects.rss
// robots.txt : seules les URLs avec paramètres de requête sont interdites (hors ?page=), le flux n'en a pas.
const FEED_URL = "https://www.codeur.com/projects.rss";

type CodeurItem = { title?: string; link?: string; guid?: string; pubDate?: string; content?: string };

const parser = new Parser<Record<string, never>, CodeurItem>();

/** Description Codeur = "Budget : X - Catégories : A, B, C" puis le texte du projet. */
function parseDescription(html: string): { budget: string; categories: string[]; text: string } {
  const text = htmlToText(html);
  const budget = text.match(/Budget\s*:\s*(.+?)\s+-\s+Cat[ée]gories/i)?.[1]?.trim() ?? "";
  const cats = text.match(/Cat[ée]gories\s*:\s*([^\n]+)/i)?.[1] ?? "";
  return { budget, categories: cats.split(",").map((c) => c.trim()).filter(Boolean), text };
}

export async function parseCodeurFeed(xml: string): Promise<Job[]> {
  const feed = await parser.parseString(xml);
  return feed.items
    .filter((it) => it.title && it.link)
    .map((it) => {
      const { budget, categories, text } = parseDescription(it.content ?? "");
      return {
        id: `codeur:${it.guid ?? it.link}`,
        title: htmlToText(it.title), // le titre est échappé deux fois (&amp;#39;)
        company: "", // client anonyme
        url: it.link ?? "",
        source: "codeur",
        date: toIso(it.pubDate),
        description: text,
        tags: categories,
        location: budget ? `Remote · budget ${budget}` : "Remote",
      };
    });
}

export const codeur: Source = {
  name: "codeur",
  fetch: async () => parseCodeurFeed(await fetchText(FEED_URL)),
};

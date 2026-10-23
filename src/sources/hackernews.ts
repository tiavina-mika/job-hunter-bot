import { fetchJson } from "../http.js";
import { htmlToText } from "../text.js";
import type { Job, Source } from "../types.js";

// API Algolia de Hacker News (https://hn.algolia.com/api) : on prend le dernier thread
// "Ask HN: Who is hiring?" publié par l'utilisateur whoishiring, puis ses commentaires de premier niveau.
const SEARCH_URL = "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=10";
const itemUrl = (id: string | number) => `https://hn.algolia.com/api/v1/items/${id}`;
const hnLink = (id: string | number) => `https://news.ycombinator.com/item?id=${id}`;

type HnComment = { id?: number; created_at?: string; text?: string | null; author?: string | null };
type HnThread = { children?: HnComment[] };
type HnSearch = { hits?: { objectID: string; title?: string }[] };

export function findHiringThreadId(search: unknown): string | undefined {
  return (search as HnSearch).hits?.find((h) => /who is hiring/i.test(h.title ?? ""))?.objectID;
}

/** Les posts suivent la convention "Entreprise | Poste | Lieu | REMOTE | ..." sur la 1re ligne. */
export function parseHackerNews(thread: unknown): Job[] {
  const children = (thread as HnThread | null)?.children;
  if (!Array.isArray(children)) return [];
  return children
    .filter((c) => c.id && c.text && c.author)
    .map((c) => {
      const text = htmlToText(c.text);
      const header = (text.split("\n")[0] ?? "").slice(0, 160);
      const parts = header.split("|").map((p) => p.trim());
      const isRemote = /\bremote\b/i.test(text);
      return {
        id: `hackernews:${c.id}`,
        title: header,
        company: parts.length > 1 ? (parts[0] ?? "") : "",
        url: hnLink(c.id ?? 0),
        source: "hackernews",
        date: c.created_at ? new Date(c.created_at).toISOString() : "",
        description: text,
        tags: [],
        // Sans mention "remote" dans le post, on met l'en-tête comme lieu : le filtre remote l'écartera.
        location: isRemote ? "Remote" : header,
      };
    });
}

export const hackernews: Source = {
  name: "hackernews",
  fetch: async () => {
    const id = findHiringThreadId(await fetchJson(SEARCH_URL));
    if (!id) throw new Error('thread "Who is hiring?" introuvable');
    return parseHackerNews(await fetchJson(itemUrl(id)));
  },
};

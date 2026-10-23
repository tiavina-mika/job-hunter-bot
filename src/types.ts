export type Job = {
  id: string; // stable et unique (ex: `${source}:${idOuUrl}`)
  title: string;
  company: string;
  url: string;
  source: string;
  date: string; // ISO 8601, vide si inconnue
  description?: string;
  tags?: string[];
  location?: string;
  score?: number; // 0-10, renseigné uniquement si le scoring IA est activé
  scoreReason?: string;
};

export type Source = { name: string; fetch: () => Promise<Job[]> };

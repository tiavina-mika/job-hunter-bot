import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Job } from "../src/types.js";
import { parseGetYourJob, parseRelativeDate } from "../src/sources/getyourjob.js";
import { findHiringThreadId, parseHackerNews } from "../src/sources/hackernews.js";
import { parseHimalayas } from "../src/sources/himalayas.js";
import { parsePortalJob } from "../src/sources/portaljob.js";
import { parseRemoteOk } from "../src/sources/remoteok.js";
import { parseRemotive } from "../src/sources/remotive.js";
import { parseWwrFeed } from "../src/sources/weworkremotely.js";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const json = (name: string): unknown => JSON.parse(fixture(name));

const expectValidJobs = (jobs: Job[], source: string) => {
  expect(jobs.length).toBeGreaterThan(0);
  for (const j of jobs) {
    expect(j.source).toBe(source);
    expect(j.id.startsWith(`${source}:`)).toBe(true);
    expect(j.title).not.toBe("");
    expect(j.url).toMatch(/^https?:\/\//);
    expect(j.date === "" || !Number.isNaN(Date.parse(j.date))).toBe(true);
  }
  expect(new Set(jobs.map((j) => j.id)).size).toBe(jobs.length);
};

describe("remoteok", () => {
  it("ignore le bloc legal et les entrées sans id, normalise le reste", () => {
    const jobs = parseRemoteOk(json("remoteok.json"));
    expectValidJobs(jobs, "remoteok");
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ id: "remoteok:1137555", company: expect.any(String) });
    expect(jobs[0]?.date).toBe("2026-10-22T00:00:21.000Z");
    expect(Array.isArray(jobs[0]?.tags)).toBe(true);
  });
  it("renvoie [] si la réponse n'est pas un tableau", () => {
    expect(parseRemoteOk({})).toEqual([]);
  });
});

describe("remotive", () => {
  it("normalise les offres", () => {
    const jobs = parseRemotive(json("remotive.json"));
    expectValidJobs(jobs, "remotive");
    expect(jobs[0]?.id).toBe("remotive:2091158");
    expect(jobs[0]?.company).toBe("Askable");
    expect(jobs[0]?.location).toBe("Worldwide");
    expect(jobs[0]?.date).toBe("2026-10-17T16:04:29.000Z");
    expect(jobs[0]?.tags).toContain("Typescript");
    expect(jobs[0]?.description).not.toMatch(/<p>/);
  });
});

describe("weworkremotely", () => {
  it("sépare 'Entreprise: Titre' et lit région/date", async () => {
    const jobs = await parseWwrFeed(fixture("wwr.xml"));
    expectValidJobs(jobs, "weworkremotely");
    expect(jobs).toHaveLength(2);
    expect(jobs[0]?.company).not.toBe("");
    expect(jobs[0]?.url).toContain("weworkremotely.com/remote-jobs/");
    expect(jobs[0]?.description).not.toMatch(/&lt;|<p>/);
  });
});

describe("himalayas", () => {
  it("normalise : date en secondes, lien de candidature, localisation", () => {
    const jobs = parseHimalayas(json("himalayas.json"));
    expectValidJobs(jobs, "himalayas");
    expect(jobs[0]?.company).toBe("Nexperia");
    expect(jobs[0]?.date).toBe(new Date(1792713219 * 1000).toISOString());
    expect(jobs[0]?.url).toContain("himalayas.app");
    expect(jobs[0]?.location).toBe("United States");
  });
});

describe("hackernews", () => {
  it("trouve le thread 'Who is hiring?' (pas 'Who wants to be hired?')", () => {
    expect(findHiringThreadId(json("hn-search.json"))).toBe("49922569");
  });
  it("parse les commentaires : en-tête, entreprise, détection remote", () => {
    const jobs = parseHackerNews(json("hn-thread.json"));
    expectValidJobs(jobs, "hackernews");
    expect(jobs).toHaveLength(4);
    const shepherd = jobs.find((j) => j.company.startsWith("Shepherd"));
    expect(shepherd?.company).toBe("Shepherd (Series B)");
    expect(shepherd?.location).not.toBe("Remote");
    expect(shepherd?.url).toMatch(/news\.ycombinator\.com\/item\?id=\d+/);
    expect(jobs.find((j) => j.title.startsWith("Sidekick"))?.location).toBe("Remote");
    expect(jobs[0]?.description).not.toMatch(/&#x2F;|<p>/);
  });
});

describe("portaljob", () => {
  it("renvoie [] sur la vraie page actuelle (offres absentes du HTML initial)", () => {
    expect(parsePortalJob(fixture("portaljob-empty.html"))).toEqual([]);
  });
  it("lit les annonces si elles sont embarquées dans les props Inertia", () => {
    const page = {
      props: { search: { data: [{ id: 12, titre: "Développeur React", entreprise: "Acme", slug: "dev-react-12", ville: "Antananarivo" }] } },
    };
    const html = `<div id="app" data-page='${JSON.stringify(page).replace(/'/g, "&#39;")}'></div>`;
    expect(parsePortalJob(html)).toEqual([
      expect.objectContaining({
        id: "portaljob:12",
        title: "Développeur React",
        company: "Acme",
        url: "https://www.portaljob-madagascar.com/emploi/dev-react-12",
        location: "Antananarivo",
      }),
    ]);
  });
});

describe("getyourjob", () => {
  const NOW = new Date("2026-10-23T06:00:00Z");
  it("parse les cartes, dédoublonne mobile/desktop, lit lieu et mode de travail", () => {
    const jobs = parseGetYourJob(fixture("getyourjob.html"), NOW);
    expectValidJobs(jobs, "getyourjob");
    expect(jobs).toHaveLength(3);
    expect(jobs[0]?.id).toMatch(/^getyourjob:[0-9a-f-]{36}$/);
    expect(jobs[0]?.url).toMatch(/^https:\/\/getyourjob\.pro\/jobs\//);
    expect(jobs[0]?.company).not.toBe("");
    expect(jobs[0]?.date).toBe(NOW.toISOString());
    expect(jobs.map((j) => j.location?.split(" · ")[1])).toEqual(expect.arrayContaining(["Hybride", "Sur site", "Full remote"]));
  });
  it("extrait les technos en tags", () => {
    const jobs = parseGetYourJob(fixture("getyourjob.html"), NOW);
    expect(jobs.flatMap((j) => j.tags ?? [])).toContain("React");
    expect(jobs.flatMap((j) => j.tags ?? [])).not.toContain("+3");
  });
  it("parseRelativeDate gère les formats du site", () => {
    expect(parseRelativeDate("Aujourd'hui", NOW)).toBe(NOW.toISOString());
    expect(parseRelativeDate("il y a 2 j", NOW)).toBe("2026-10-21T06:00:00.000Z");
    expect(parseRelativeDate("il y a 3 h", NOW)).toBe("2026-10-23T03:00:00.000Z");
    expect(parseRelativeDate("n'importe quoi", NOW)).toBe("");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadEnv, parseConfig } from "../src/config.js";
import { parseRatings } from "../src/score.js";

describe("config", () => {
  it("le config.json du repo est valide", () => {
    const raw: unknown = JSON.parse(readFileSync(new URL("../config.json", import.meta.url), "utf8"));
    expect(parseConfig(raw).include.length).toBeGreaterThan(0);
  });
  it("rejette une config invalide", () => {
    expect(() => parseConfig({ include: [], sources: {} })).toThrow(/config\.json invalide/);
  });
  it("loadEnv liste les variables manquantes sans afficher de valeur", () => {
    const bad = { GMAIL_APP_PASSWORD: "hunter2", EMAIL_TO: "pas-un-email" };
    expect(() => loadEnv(bad)).toThrow(/MONGODB_URI/);
    try {
      loadEnv(bad);
    } catch (e) {
      expect((e as Error).message).not.toContain("hunter2");
      expect((e as Error).message).not.toContain("pas-un-email");
    }
  });
  it("loadEnv en dry-run n'exige rien", () => {
    expect(loadEnv({}, { requireAll: false })).toEqual({});
  });
});

describe("score", () => {
  it("parseRatings extrait le JSON même entouré de texte", () => {
    const r = parseRatings('Voici :\n[{"i":0,"score":8,"reason":"ok"},{"i":1,"score":"x"}]');
    expect(r).toEqual([{ i: 0, score: 8, reason: "ok" }]);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadEnv, parseConfig } from "../src/config.js";
import { describeMongoError } from "../src/dedupe.js";
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
  it("loadEnv retire les espaces du mot de passe d'application", () => {
    const env = loadEnv({
      MONGODB_URI: "mongodb+srv://x",
      GMAIL_USER: "bot@gmail.com",
      GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop",
      EMAIL_TO: "me@example.com",
    });
    expect(env.GMAIL_APP_PASSWORD).toBe("abcdefghijklmnop");
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

describe("describeMongoError", () => {
  it("ajoute une piste pour l'erreur TLS d'Atlas (IP non autorisée)", () => {
    const msg = describeMongoError(new Error("error:0A000438:SSL routines:ssl3_read_bytes:tlsv1 alert internal error"));
    expect(msg).toContain("Network Access");
  });
  it("distingue un échec DNS SRV d'un problème d'allowlist", () => {
    const msg = describeMongoError(new Error("querySrv ECONNREFUSED _mongodb._tcp.cluster0.example.mongodb.net"));
    expect(msg).toContain("DNS");
    expect(msg).not.toContain("Network Access");
  });
  it("ajoute une piste pour une erreur d'authentification", () => {
    expect(describeMongoError(new Error("bad auth : Authentication failed."))).toContain("mot de passe");
  });
  it("laisse les autres erreurs telles quelles", () => {
    expect(describeMongoError(new Error("boom"))).toBe("boom");
  });
});

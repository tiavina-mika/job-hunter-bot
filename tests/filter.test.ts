import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";
import { filterJobs, matchesKeyword } from "../src/filter.js";
import type { Job } from "../src/types.js";

const NOW = new Date("2026-10-23T06:00:00Z");
const config = parseConfig({
  include: ["react", "node.js", "full-stack"],
  exclude: ["unpaid", "stage"],
  remoteOnly: true,
  maxAgeDays: 7,
  excludeLocations: ["us only"],
  sources: {},
});

const job = (over: Partial<Job> = {}): Job => ({
  id: "t:1",
  title: "React Developer",
  company: "ACME",
  url: "https://example.com/1",
  source: "test",
  date: "2026-10-22T00:00:00Z",
  ...over,
});

describe("filterJobs", () => {
  it("garde une offre avec un mot-clé include dans le titre", () => {
    expect(filterJobs([job()], config, NOW)).toHaveLength(1);
  });
  it("cherche aussi dans la description et les tags", () => {
    expect(filterJobs([job({ title: "Dev", description: "We use Node.js daily" })], config, NOW)).toHaveLength(1);
    expect(filterJobs([job({ title: "Dev", tags: ["React"] })], config, NOW)).toHaveLength(1);
  });
  it("rejette sans mot-clé include", () => {
    expect(filterJobs([job({ title: "Accountant" })], config, NOW)).toHaveLength(0);
  });
  it("rejette si un mot-clé exclude est présent", () => {
    expect(filterJobs([job({ description: "This is an unpaid role" })], config, NOW)).toHaveLength(0);
  });
  it("ne confond pas react avec reactive (mot entier)", () => {
    expect(matchesKeyword("Reactive programming", "react")).toBe(false);
    expect(matchesKeyword("React.js dev", "react")).toBe(true);
  });
  it("remote : garde sans lieu, rejette un lieu non remote", () => {
    expect(filterJobs([job({ location: "" })], config, NOW)).toHaveLength(1);
    expect(filterJobs([job({ location: "Worldwide" })], config, NOW)).toHaveLength(1);
    expect(filterJobs([job({ location: "Paris, France" })], config, NOW)).toHaveLength(0);
  });
  it("remoteOnly=false garde les lieux physiques", () => {
    expect(filterJobs([job({ location: "Paris, France" })], { ...config, remoteOnly: false }, NOW)).toHaveLength(1);
  });
  it("rejette les lieux exclus", () => {
    expect(filterJobs([job({ location: "Remote - US Only" })], config, NOW)).toHaveLength(0);
  });
  it("âge : rejette > maxAgeDays, garde les récentes et les dates inconnues", () => {
    expect(filterJobs([job({ date: "2026-10-10T00:00:00Z" })], config, NOW)).toHaveLength(0);
    expect(filterJobs([job({ date: "2026-10-17T07:00:00Z" })], config, NOW)).toHaveLength(1);
    expect(filterJobs([job({ date: "" })], config, NOW)).toHaveLength(1);
  });
});

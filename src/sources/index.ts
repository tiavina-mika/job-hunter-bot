import type { Config } from "../config.js";
import type { Source } from "../types.js";
import { hackernews } from "./hackernews.js";
import { himalayas } from "./himalayas.js";
import { codeur } from "./codeur.js";
import { freework } from "./freework.js";
import { getyourjob } from "./getyourjob.js";
import { madajob } from "./madajob.js";
import { portaljob } from "./portaljob.js";
import { remoteok } from "./remoteok.js";
import { remotive } from "./remotive.js";
import { weworkremotely } from "./weworkremotely.js";

// Pour ajouter une source : créer src/sources/<nom>.ts exportant un `Source`, l'ajouter ici,
// puis ajouter `"<nom>": true` dans config.json -> sources.
export const ALL_SOURCES: Source[] = [remoteok, remotive, weworkremotely, himalayas, hackernews, getyourjob, freework, codeur, madajob, portaljob];

export function activeSources(config: Config): Source[] {
  return ALL_SOURCES.filter((s) => config.sources[s.name]);
}

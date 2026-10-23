import nodemailer, { type SendMailOptions } from "nodemailer";
import type { Job } from "./types.js";

type Transport = { sendMail: (opts: SendMailOptions) => Promise<unknown> };

export type Digest = { subject: string; html: string; text: string };

/** Pages d'origine à citer (les conditions des API/flux demandent un lien et la mention de la source). */
export const SOURCE_INFO: Record<string, { label: string; url: string }> = {
  remoteok: { label: "Remote OK", url: "https://remoteok.com" },
  remotive: { label: "Remotive", url: "https://remotive.com" },
  weworkremotely: { label: "We Work Remotely", url: "https://weworkremotely.com" },
  himalayas: { label: "Himalayas", url: "https://himalayas.app" },
  getyourjob: { label: "GetYourJob", url: "https://getyourjob.pro/offers" },
  hackernews: { label: "Hacker News — Who is hiring?", url: "https://news.ycombinator.com/submitted?id=whoishiring" },
  portaljob: { label: "PortalJob Madagascar", url: "https://www.portaljob-madagascar.com" },
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : "#");

const formatDate = (iso: string) => (iso ? iso.slice(0, 10) : "date inconnue");

function groupBySource(jobs: Job[]): [string, Job[]][] {
  const map = new Map<string, Job[]>();
  for (const j of jobs) map.set(j.source, [...(map.get(j.source) ?? []), j]);
  return [...map.entries()];
}

export function buildDigest(jobs: Job[]): Digest {
  const n = jobs.length;
  const subject = `${n} ${n > 1 ? "nouvelles offres" : "nouvelle offre"} du jour`;
  const groups = groupBySource(jobs);
  const scored = jobs.some((j) => j.score !== undefined);

  const htmlSections = groups
    .map(([source, list]) => {
      const info = SOURCE_INFO[source];
      const head = info ? `<a href="${info.url}">${esc(info.label)}</a>` : esc(source);
      const items = list
        .map((j) => {
          const scoreLine =
            j.score !== undefined
              ? `<br><span style="color:#0a6">Score ${j.score}/10</span> <em style="color:#666">${esc(j.scoreReason ?? "")}</em>`
              : "";
          return `<li style="margin-bottom:10px"><a href="${esc(safeUrl(j.url))}" style="font-weight:600">${esc(j.title)}</a><br>
<span style="color:#444">${esc(j.company || "Entreprise non précisée")}</span>
<span style="color:#888"> · ${formatDate(j.date)}${j.location ? ` · ${esc(j.location)}` : ""}</span>${scoreLine}</li>`;
        })
        .join("\n");
      return `<h2 style="font-size:16px;border-bottom:1px solid #ddd;padding-bottom:4px">${head} (${list.length})</h2><ul style="padding-left:18px">${items}</ul>`;
    })
    .join("\n");

  const attributions = groups
    .map(([source]) => SOURCE_INFO[source])
    .filter((i): i is { label: string; url: string } => Boolean(i))
    .map((i) => `<a href="${i.url}">${esc(i.label)}</a>`)
    .join(", ");

  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:auto;color:#222">
<h1 style="font-size:20px">${esc(subject)}</h1>${scored ? `<p style="color:#666">Trié par score décroissant.</p>` : ""}
${htmlSections || "<p>Aucune nouvelle offre aujourd'hui.</p>"}
<hr><p style="font-size:12px;color:#888">Offres issues de : ${attributions || "—"}. Digest généré par job-hunter-bot.</p>
</body></html>`;

  const textSections = groups
    .map(([source, list]) => {
      const info = SOURCE_INFO[source];
      const lines = list
        .map((j) => {
          const score = j.score !== undefined ? ` [score ${j.score}/10 : ${j.scoreReason ?? ""}]` : "";
          return `- ${j.title} — ${j.company || "Entreprise non précisée"} (${formatDate(j.date)})${score}\n  ${j.url}`;
        })
        .join("\n");
      return `== ${info?.label ?? source} (${list.length}) — ${info?.url ?? ""}\n${lines}`;
    })
    .join("\n\n");
  const sourceUrls = groups.map(([s]) => SOURCE_INFO[s]?.url).filter(Boolean).join(", ");
  const text = `${subject}\n\n${textSections || "Aucune nouvelle offre aujourd'hui."}\n\nSources : ${sourceUrls}\n`;

  return { subject, html, text };
}

export type MailEnv = { GMAIL_USER: string; GMAIL_APP_PASSWORD: string; EMAIL_TO: string };

export function createTransport(env: MailEnv): Transport {
  return nodemailer.createTransport({ service: "gmail", auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD } });
}

/** Envoie le digest. L'erreur levée ne contient jamais le mot de passe d'application. */
export async function sendDigest(jobs: Job[], env: MailEnv, transport: Transport = createTransport(env)): Promise<void> {
  const { subject, html, text } = buildDigest(jobs);
  try {
    await transport.sendMail({ from: env.GMAIL_USER, to: env.EMAIL_TO, subject, html, text });
  } catch (err) {
    const code = (err as { code?: string }).code;
    const reason = err instanceof Error ? err.message.split("\n")[0] ?? "" : "erreur inconnue";
    throw new Error(`Échec d'envoi de l'email${code ? ` (${code})` : ""} : ${reason.replaceAll(env.GMAIL_APP_PASSWORD, "***")}`);
  }
}

import { describe, expect, it, vi } from "vitest";
import { buildDigest, sendDigest } from "../src/notify.js";
import type { Job } from "../src/types.js";

const jobs: Job[] = [
  { id: "remoteok:1", title: "React <Dev> & co", company: "ACME", url: "https://remoteok.com/remote-jobs/1", source: "remoteok", date: "2026-10-22T00:00:00Z" },
  { id: "remotive:2", title: "Node.js Engineer", company: "Foo", url: "https://remotive.com/remote-jobs/2", source: "remotive", date: "" },
  { id: "remoteok:3", title: "Fullstack", company: "Bar", url: "https://remoteok.com/remote-jobs/3", source: "remoteok", date: "2026-10-21T00:00:00Z" },
];
const env = { GMAIL_USER: "bot@gmail.com", GMAIL_APP_PASSWORD: "secret-app-pass", EMAIL_TO: "me@example.com" };

describe("buildDigest", () => {
  it("sujet avec le nombre d'offres, groupé par source, liens cliquables", () => {
    const d = buildDigest(jobs);
    expect(d.subject).toBe("3 nouvelles offres du jour");
    expect(d.html).toContain('href="https://remoteok.com/remote-jobs/1"');
    expect(d.html).toContain("Remote OK</a> (2)");
    expect(d.html).toContain("Remotive</a> (1)");
    expect(d.text).toContain("https://remotive.com/remote-jobs/2");
    expect(d.text).toContain("== Remote OK (2)");
  });
  it("échappe le HTML des titres", () => {
    expect(buildDigest(jobs).html).toContain("React &lt;Dev&gt; &amp; co");
  });
  it("singulier pour une seule offre", () => {
    expect(buildDigest([jobs[0] as Job]).subject).toBe("1 nouvelle offre du jour");
  });
  it("affiche les scores quand ils existent", () => {
    const d = buildDigest([{ ...(jobs[0] as Job), score: 8, scoreReason: "Stack React" }]);
    expect(d.html).toContain("Score 8/10");
    expect(d.text).toContain("score 8/10");
  });
});

describe("sendDigest", () => {
  it("envoie via le transport mocké avec from/to corrects (aucun vrai email)", async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    await sendDigest(jobs, env, { sendMail });
    expect(sendMail).toHaveBeenCalledOnce();
    expect(sendMail.mock.calls[0]?.[0]).toMatchObject({
      from: "bot@gmail.com",
      to: "me@example.com",
      subject: "3 nouvelles offres du jour",
      html: expect.any(String),
      text: expect.any(String),
    });
  });
  it("en cas d'échec, lève une erreur claire sans le mot de passe", async () => {
    const sendMail = vi.fn().mockRejectedValue(Object.assign(new Error("Invalid login: secret-app-pass rejected"), { code: "EAUTH" }));
    const err = await sendDigest(jobs, env, { sendMail }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("EAUTH");
    expect((err as Error).message).not.toContain("secret-app-pass");
  });
});

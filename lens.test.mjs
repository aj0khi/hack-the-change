import test from "node:test";
import assert from "node:assert/strict";
import { createIssuer, signCredential, alterCredential } from "./trust.mjs";
import { runLens } from "./lens.mjs";
import { normalizeJob } from "./adzuna.mjs";

const doug = {
  title: "Help neighbours connect online",
  witness: "Doug",
  issuer: "Community Centre (fictional demo)",
  student: "Priya Sharma",
  issuedAt: "2026-11-07",
  transcript:
    "Priya was patient and explained every step clearly. She showed me how to call my family and wrote the steps down for me.",
  mappings: [{ skill: "Communication", quote: "Priya was patient and explained every step clearly." }],
};
const rosa = {
  ...doug,
  title: "Make a community spreadsheet easier",
  witness: "Rosa",
  transcript: "She cleaned up our sign-up spreadsheet so we stopped double-booking volunteers.",
  mappings: [{ skill: "Digital", quote: "She cleaned up our sign-up spreadsheet" }],
};

async function setup() {
  const issuer = await createIssuer();
  const credentials = [await signCredential(doug, issuer), await signCredential(rosa, issuer)];
  return { issuer, credentials };
}

const req = (text, kind, matches) => ({ text, kind, matches });
const match = (credentialId, quote, evidenceType = "action") => ({ credentialId, quote, evidenceType, why: "test" });

test("keeps a verbatim quote from the cited credential", async () => {
  const { issuer, credentials } = await setup();
  const generate = async () => ({
    requirements: [req("Explain technical steps to customers", "soft", [match("0", "explained every step clearly")])],
  });
  const { body } = await runLens({ posting: "x", credentials, issuerPublicKey: issuer.publicKey }, { generate });
  assert.equal(body.stats.matched, 1);
  assert.equal(body.requirements[0].matches[0].witness, "Doug");
  assert.equal(body.stats.droppedByGrounding, 0);
});

test("drops a fabricated quote", async () => {
  const { issuer, credentials } = await setup();
  const generate = async () => ({
    requirements: [req("Leadership", "soft", [match("0", "Priya is a natural leader")])],
  });
  const { body } = await runLens({ posting: "x", credentials, issuerPublicKey: issuer.publicKey }, { generate });
  assert.equal(body.stats.matched, 0);
  assert.equal(body.stats.gaps, 1);
  assert.equal(body.stats.droppedByGrounding, 1);
});

test("drops a real quote attributed to the wrong credential", async () => {
  const { issuer, credentials } = await setup();
  const generate = async () => ({
    requirements: [req("Spreadsheets", "soft", [match("0", "She cleaned up our sign-up spreadsheet")])],
  });
  const { body } = await runLens({ posting: "x", credentials, issuerPublicKey: issuer.publicKey }, { generate });
  assert.equal(body.stats.matched, 0);
  assert.equal(body.stats.droppedByGrounding, 1);
});

test("praise cannot satisfy a technical requirement", async () => {
  const { issuer, credentials } = await setup();
  const generate = async () => ({
    requirements: [req("SQL", "technical", [match("0", "Priya was patient", "praise")])],
  });
  const { body } = await runLens({ posting: "x", credentials, issuerPublicKey: issuer.publicKey }, { generate });
  assert.equal(body.stats.matched, 0);
  assert.equal(body.rejected[0].reason, "Praise cannot prove a technical skill or credential.");
});

test("a tampered credential is never sent to the model and never matched", async () => {
  const { issuer, credentials } = await setup();
  const tampered = [alterCredential(credentials[0]), credentials[1]];
  let prompt = "";
  const generate = async (input) => {
    prompt = input.prompt;
    return { requirements: [req("Patience", "soft", [match("0", "Priya was patient")])] };
  };
  const { body } = await runLens({ posting: "x", credentials: tampered, issuerPublicKey: issuer.publicKey }, { generate });
  assert.ok(!prompt.includes("Priya was patient"), "tampered transcript leaked into prompt");
  assert.ok(!prompt.includes("[credentialId: 0]"));
  assert.ok(prompt.includes("[credentialId: 1]"));
  assert.equal(body.stats.matched, 0);
  assert.equal(body.stats.invalidCredentials, 1);
});

test("model failure or timeout returns fallback", async () => {
  const { issuer, credentials } = await setup();
  const failing = await runLens(
    { posting: "x", credentials, issuerPublicKey: issuer.publicKey },
    { generate: async () => { throw new Error("quota"); } },
  );
  assert.equal(failing.body.fallback, true);
  const slow = await runLens(
    { posting: "x", credentials, issuerPublicKey: issuer.publicKey },
    { generate: () => new Promise(() => {}), timeoutMs: 20 },
  );
  assert.equal(slow.body.fallback, true);
  const none = await runLens({ posting: "x", credentials, issuerPublicKey: issuer.publicKey }, {});
  assert.equal(none.body.fallback, true);
});

test("rejects an empty posting", async () => {
  const { issuer, credentials } = await setup();
  const { status } = await runLens({ posting: "  ", credentials, issuerPublicKey: issuer.publicKey }, {});
  assert.equal(status, 400);
});

test("normalizes an Adzuna result and flags truncated descriptions", () => {
  const job = normalizeJob(
    {
      id: 42,
      title: "<strong>IT</strong> Support Analyst",
      company: { display_name: "Acme" },
      location: { display_name: "Calgary, Alberta" },
      description: "Provide friendly <b>help desk</b> support…",
      redirect_url: "https://www.adzuna.ca/details/42",
    },
    "IT support",
  );
  assert.equal(job.title, "IT Support Analyst");
  assert.equal(job.description, "Provide friendly help desk support…");
  assert.equal(job.snippet, true);
});

test("project suggestions: only real catalog ids, only on soft/technical gaps, max 2", async () => {
  const { issuer, credentials } = await setup();
  const suggest = (projectId) => ({ projectId, why: "practice" });
  const generate = async () => ({
    requirements: [
      { ...req("Spreadsheets", "technical", []), suggestedProjects: [suggest("volunteer-database"), suggest("made-up-project"), suggest("volunteer-database")] },
      { ...req("Class 5 driver's licence", "credential", []), suggestedProjects: [suggest("tech-help-hour")] },
      { ...req("Explain steps", "soft", [match("0", "explained every step clearly")]), suggestedProjects: [suggest("digital-guide")] },
      { ...req("Writing", "soft", []), suggestedProjects: [suggest("newsletter"), suggest("digital-guide"), suggest("tech-help-hour")] },
    ],
  });
  const { body } = await runLens({ posting: "x", credentials, issuerPublicKey: issuer.publicKey }, { generate });
  const [sheets, licence, explain, writing] = body.requirements;
  assert.deepEqual(sheets.suggestedProjects.map((p) => p.projectId), ["volunteer-database"]);
  assert.equal(sheets.suggestedProjects[0].title, "Clean up a volunteer database");
  assert.deepEqual(licence.suggestedProjects, []);
  assert.deepEqual(explain.suggestedProjects, []);
  assert.equal(writing.suggestedProjects.length, 2);
  // made-up id + duplicate + credential + matched requirement + third writing suggestion
  assert.equal(body.stats.droppedSuggestions, 5);
});

test("the prompt lists the project catalog", async () => {
  const { issuer, credentials } = await setup();
  let prompt = "";
  await runLens(
    { posting: "x", credentials, issuerPublicKey: issuer.publicKey },
    { generate: async (input) => { prompt = input.prompt; return { requirements: [] }; } },
  );
  assert.ok(prompt.includes("[projectId: volunteer-database]"));
});

test("skillDemand counts each posting once per skill", async () => {
  const { skillDemand } = await import("./skills.mjs");
  const demand = skillDemand([
    { title: "IT Support", description: "Troubleshoot computers. Excellent communication. Communicate with clients." },
    { title: "Clerk", description: "Use Excel spreadsheets daily." },
    { title: "Driver", description: "Class 1 licence required." },
  ]);
  assert.equal(demand.total, 3);
  assert.equal(demand.counts.Communication, 1);
  assert.equal(demand.counts.Digital, 2);
  assert.equal(demand.counts["Problem solving"], 1);
  assert.equal(demand.counts.Reading, 0);
});

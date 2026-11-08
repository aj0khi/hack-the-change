import {
  verifyCredential,
  alterCredential,
} from "./trust.mjs";
import { projects, keywordProjectSuggestions } from "./lens/projects.mjs";
import { skillTerms } from "./lens/skills.mjs";
import { buildStudentPathway } from "./lens/student-pathway.mjs";
import { makeShareCard } from "./verification/share-card.mjs";

const examples = {
  transcript:
    "Priya was patient and explained every step clearly. She showed me how to call my family and wrote the steps down for me.",
  title: "Help neighbours connect online",
  witness: "Doug",
  issuer: "Community Centre (fictional demo)",
  student: "Priya Sharma",
  example: true,
  issuedAt: "2026-11-07",
  mappings: [
    {
      skill: "Communication",
      quote: "Priya was patient and explained every step clearly.",
    },
    {
      skill: "Digital",
      quote:
        "She showed me how to call my family and wrote the steps down for me.",
    },
  ],
};
const jobExample = `Client Support Coordinator (Junior) — Bow River Community Services (fictional example), Calgary, AB

We're looking for a warm, organized person to join our front-desk technology team. You'll be the first point of contact for older adults and newcomers who need help with our online booking system, video appointments and shared devices.

What you'll do:
You will walk clients through using tablets, phones and video-call apps, explaining technical steps in plain language and staying patient when things don't work the first time. You'll create simple how-to guides and checklists for clients and staff, and keep our volunteer and appointment spreadsheets accurate and up to date.

What we're looking for:
Excellent communication skills with people of all ages and comfort levels with technology. Experience writing clear instructions or documentation. Comfort with spreadsheets (Excel or Google Sheets). Basic SQL or database experience is an asset. A valid Class 5 Alberta driver's licence and a clean police information check are required. CompTIA A+ certification is considered an asset. Availability for some evening and weekend shifts.

We offer a supportive team, paid training and a transit pass.`;
let jobPostings = [];
let jobDemand; // { total, counts: { [skill]: n } } from /api/jobs

// "Builds Digital: mentioned in 12 of 30 Calgary posting excerpts" for a project's most-asked-for skill.
function demandLine(skills) {
  if (!jobDemand?.total || !skills?.length) return "";
  const [skill, count] = skills
    .map((name) => [name, jobDemand.counts?.[name] ?? 0])
    .sort((a, b) => b[1] - a[1])[0];
  if (!count) return "";
  return `<span class="suggestion-demand">Builds ${escapeHTML(skill)}: mentioned in ${count} of ${jobDemand.total} Calgary posting excerpts (Adzuna)</span>`;
}
const viewNames = {
  overview: "Overview",
  projects: "Explore projects",
  credentials: "My credentials",
  lens: "Employer lens",
  vouch: "Give a vouch",
  kiosk: "Easy vouch",
  verification: "Account verification",
};
const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const refreshIcons = () => window.lucide?.createIcons();
const announce = (message) => {
  document.querySelector("#announcement").textContent = message;
};
let database;
let issuer;
let credentials = [];
let selectedCredential;
let pendingVouch;
let approvalSource = "form"; // "form" or "kiosk": where to go after issuing
let shareToken;

async function demoRequest(path, body) {
  const response = await fetch(path, body === undefined ? { cache: "no-store" } : {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Demo credential service is unavailable.");
  return result;
}

async function signDemo(payload) {
  return (await demoRequest("/api/demo-credentials/issue", payload)).token;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("vouch-yyc-demo", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readState(key) {
  return new Promise((resolve, reject) => {
    const request = database
      .transaction("state", "readonly")
      .objectStore("state")
      .get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function writeState(key, value) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("state", "readwrite");
    transaction.objectStore("state").put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error || new Error("Storage transaction aborted."));
  });
}

function saveMigratedCredentials(tokens, publicKey) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("state", "readwrite");
    const state = transaction.objectStore("state");
    state.put(tokens, "credentials");
    state.put(publicKey, "server-public-key");
    state.delete("issuer");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("Storage transaction aborted."));
  });
}

async function initialize() {
  try {
    if (!window.isSecureContext || !crypto.subtle)
      throw new Error("Use localhost or HTTPS for credential signing.");
    database = await openDatabase();
    const oldIssuer = await readState("issuer");
    const previousServerKey = await readState("server-public-key");
    issuer = await demoRequest("/api/demo-credentials/issuer");
    const stored = await readState("credentials");
    if (stored === undefined) {
      credentials = [await signDemo(examples)];
    } else {
      if (!Array.isArray(stored)) throw new Error("Stored credentials have an invalid format.");
      const migrated = [];
      let migrationApproved = false;
      for (const token of stored) {
        if ((await verifyCredential(token, issuer.publicKey)).valid) {
          migrated.push(token);
          continue;
        }
        const oldKey = previousServerKey || oldIssuer?.publicKey;
        const previous = oldKey ? await verifyCredential(token, oldKey) : { valid: false };
        if (!previous.valid) throw new Error("A saved credential cannot be verified with its original key. It was not changed.");
        if (!migrationApproved) {
          if (!window.confirm("To keep your saved demo credentials, their contents must be sent to this server and re-signed with its demo key. They will not be published unless you choose Share. Continue?")) throw new Error("Migration was declined.");
          migrationApproved = true;
        }
        migrated.push(await signDemo(previous.payload));
      }
      credentials = migrated;
    }
    await saveMigratedCredentials(credentials, issuer.publicKey);
    await renderCredentials();
    renderLens();
  } catch (error) {
    issuer = undefined;
    document.querySelector(".demo-notice span").textContent =
      `Credential storage or signing is unavailable: ${error.message}. Saved credentials have not been deleted.`;
    document.querySelector("#vouch-error").textContent =
      "Signing is unavailable in this browser; credentials cannot be issued.";
    await renderCredentials();
  }
}

function showView(name) {
  if (!viewNames[name]) name = "overview";
  document.querySelectorAll(".view").forEach((view) => {
    view.hidden = view.id !== name;
  });
  document.querySelectorAll(".nav-link").forEach((button) => {
    const active = button.dataset.view === name;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelector("#breadcrumb").textContent =
    viewNames[name].toUpperCase();
  document.title = `${viewNames[name]} | Proofly`;
  if (location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
  document.body.classList.toggle("kiosk-mode", name === "kiosk");
  if (name === "kiosk") renderKiosk();
  else stopDictation();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function projectCard(project) {
  return `<article class="project-card" data-project-card="${escapeHTML(project.id)}" tabindex="-1"><span class="project-icon ${project.color}">${icon(project.icon)}</span><div class="project-body"><div class="project-meta">${escapeHTML(project.organization.toUpperCase())} <span>·</span> ${project.time}</div><h3>${escapeHTML(project.title)}</h3><p>${escapeHTML(project.description)}</p><div class="skills-row">${project.skills.map((skill) => `<span class="skill-chip">${escapeHTML(skill)}</span>`).join("")}</div></div><button class="project-arrow" type="button" data-project="${escapeHTML(project.title)}" aria-label="Give a vouch for ${escapeHTML(project.title)}" title="Give a vouch">${icon("arrow-up-right")}</button></article>`;
}

function renderProjects() {
  document.querySelector("#overview-projects").innerHTML = projects
    .slice(0, 2)
    .map(projectCard)
    .join("");
  document.querySelector("#all-projects").innerHTML = projects
    .map(projectCard)
    .join("");
  // The vouch task list comes from the same catalog as the project suggestions.
  document.querySelector("#vouch-task").innerHTML =
    '<option value="">Choose a project</option>' +
    projects
      .map((project) => `<option>${escapeHTML(project.title)}</option>`)
      .join("");
  refreshIcons();
}

async function verifiedCredentials() {
  if (!issuer) return [];
  const checks = await Promise.all(
    credentials.map(async (token, index) => ({
      index,
      token,
      ...(await verifyCredential(token, issuer.publicKey)),
    })),
  );
  return checks.filter((check) => check.valid);
}

function skillsMarkup(payload) {
  return `<div class="skills-row">${payload.mappings.map((mapping) => `<span class="skill-chip">${escapeHTML(mapping.skill)}</span>`).join("")}</div>`;
}

async function renderCredentials() {
  const verified = await verifiedCredentials();
  document.querySelectorAll("[data-count]").forEach((element) => {
    element.textContent = verified.length;
  });
  document.querySelectorAll("[data-count-s]").forEach((element) => {
    element.textContent = verified.length === 1 ? "" : "s";
  });
  const latest = verified.at(-1);
  document.querySelector("#latest-credential").innerHTML = latest
    ? `<div class="credential-mini"><div class="credential-mini-top"><span class="badge-symbol">${icon("award")}</span><span class="verified">${icon("shield-check")} SIGNATURE VALID</span></div><h3>${escapeHTML(latest.payload.title)}</h3><p>${escapeHTML(latest.payload.issuer)} · Demo</p><button class="text-link" type="button" data-credential="${latest.index}">View the story ${icon("arrow-right")}</button></div>`
    : '<div class="credential-mini"><p>No valid signed credentials yet.</p><button class="text-link" type="button" data-view="vouch">Create a demo vouch →</button></div>';
  document.querySelector("#credentials-list").innerHTML = verified.length
    ? verified
        .slice()
        .reverse()
        .map(
          ({ payload, index }) =>
            `<article class="credential-full"><div class="credential-full-top"><span class="badge-symbol">${icon("award")}</span><div><h3>${escapeHTML(payload.title)}</h3><p>${escapeHTML(payload.issuer)} · ${escapeHTML(payload.issuedAt)} · Demo</p></div><span class="verified">${icon("shield-check")} SIGNATURE VALID</span></div><div class="credential-quote">“${escapeHTML(payload.transcript)}”<strong>— ${escapeHTML(payload.witness)}, community member · ${payload.example ? "fictional example" : "demo entry"}</strong></div>${skillsMarkup(payload)}<div class="credential-actions"><span class="project-meta">EVIDENCE ATTACHED · DEMO</span><button class="text-link" type="button" data-share="${index}">Share ${icon("share-2")}</button><button class="text-link" type="button" data-credential="${index}">View credential ${icon("arrow-up-right")}</button></div></article>`,
        )
        .join("")
    : '<div class="credential-full"><h3>No valid signed credentials yet.</h3><p>Create a demo vouch to get started.</p></div>';
  refreshIcons();
}

async function openCredential(index) {
  const token = credentials[index];
  if (!token || !issuer) return;
  const result = await verifyCredential(token, issuer.publicKey);
  if (!result.valid) {
    announce("This credential is not valid.");
    return;
  }
  selectedCredential = token;
  const payload = result.payload;
  document.querySelector("#dialog-content").innerHTML =
    `<div class="dialog-detail"><h3>${escapeHTML(payload.title)}</h3><p><strong>Issuer:</strong> ${escapeHTML(payload.issuer)} · demo identity</p><p><strong>Witness:</strong> ${escapeHTML(payload.witness)} ${payload.example ? "(fictional example)" : "(demo entry)"}</p><p><strong>Student:</strong> ${escapeHTML(payload.student)}</p><p><strong>Signature:</strong> valid against the server's demo issuer key</p></div><div class="credential-quote">“${escapeHTML(payload.transcript)}”</div>${payload.mappings.map((mapping) => `<p><span class="skill-chip">${escapeHTML(mapping.skill)}</span> <span class="result-desc">“${escapeHTML(mapping.quote)}”</span></p>`).join("")}`;
  document.querySelector("#credential-token").value = token;
  document.querySelector("#verify-result").textContent =
    "Signature valid against the server’s demo issuer key.";
  document.querySelector("#credential-dialog").showModal();
  refreshIcons();
}

// Lens state: who is looking, and the last result so the toggle can re-render without a new API call.
let lensAudience = "employer";
let lastLens; // { mode: "ai", data } | { mode: "offline", input }
let lensRequest = 0;
let lensRender = 0;
const DISCLAIMER_AI =
  "AI extracts requirements and proposes matches; every quote is checked word-for-word against a signed credential before it's shown. Gaps are never filled by AI. Not a hiring recommendation.";
const DISCLAIMER_OFFLINE =
  "The AI lens is unavailable, so simple keyword rules matched requirements to signed credentials. Review every source and gap yourself. Not a hiring recommendation.";
const DISCLAIMER_STUDENT =
  "Student view uses keyword hints and this browser's signed demo evidence, not an assessment of your ability or a hiring recommendation. Project ideas are fictional. Review the full posting, including qualifications we may miss.";

function suggestionMarkup(kind, suggestions, keywordBased = false) {
  if (lensAudience !== "student") return "";
  if (kind === "credential" || kind === "other")
    return `<div class="suggestion-box muted"><p>This needs an official credential or availability; community projects can't prove it.</p></div>`;
  if (!suggestions?.length)
    // Offline lines are raw sentences (headings, boilerplate), so stay quiet rather than add noise.
    return keywordBased
      ? ""
      : `<div class="suggestion-box muted"><p>No community project in our catalog builds this yet.</p></div>`;
  return `<div class="suggestion-box"><p class="suggestion-title">${icon("sprout")} Fictional demo projects that could build this${keywordBased ? " <span>(keyword match)</span>" : ""}</p>${suggestions
    .map(
      (s) =>
        `<div class="suggestion"><div><strong>${escapeHTML(s.title)}</strong><span class="suggestion-meta">${escapeHTML(s.organization)} · ${escapeHTML(s.time)}</span>${s.why ? `<p>${escapeHTML(s.why)}</p>` : ""}${demandLine(s.skills)}</div><button class="button subtle" type="button" data-project="${escapeHTML(s.title)}">Use for a demo vouch ${icon("arrow-right")}</button></div>`,
    )
    .join("")}</div>`;
}

const gapMarkup = (text, kind, suggestions, keywordBased) =>
  `<div class="lens-result"><div class="lens-result-top"><span class="result-status gap">${icon("minus")}</span><h3>${escapeHTML(text)}${kind ? ` <span class="kind-tag">${escapeHTML(kind)}</span>` : ""}</h3></div><p class="result-desc">No verified evidence yet. This is not a judgment of ability.</p>${suggestionMarkup(kind, suggestions, keywordBased)}</div>`;

// Offline suggestions: catalog projects sharing a skill the gap line mentions.
function keywordSuggestions(line) {
  const specific = keywordProjectSuggestions(line);
  if (specific) return specific;
  const wanted = Object.keys(skillTerms).filter((skill) => skillTerms[skill].test(line));
  return projects
    .map((project) => ({ project, score: project.skills.filter((s) => wanted.includes(s)).length }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ project }) => ({ ...project, why: `Practises ${project.skills.filter((s) => wanted.includes(s)).join(" and ").toLowerCase()}.` }));
}

async function renderStudentPathway(input, target, renderId) {
  const validCredentials = await verifiedCredentials();
  if (renderId !== lensRender || lensAudience !== "student") return;
  const skills = buildStudentPathway(input, validCredentials);
  const supported = skills.filter((skill) => skill.evidence.length);
  const gaps = skills.filter((skill) => !skill.evidence.length);
  const evidenceCards = supported.map((skill) =>
    `<article class="pathway-card"><h4>${escapeHTML(skill.name)}</h4><p class="pathway-context">Posting mentions: “${escapeHTML(skill.context)}”</p>${skill.evidence.map((item) => `<p class="result-desc">Demo evidence · ${escapeHTML(item.skill)}: “${escapeHTML(item.quote)}”</p><button class="text-link" type="button" data-credential="${item.index}">View signed evidence ${icon("arrow-up-right")}</button>`).join("")}</article>`,
  ).join("");
  const projectMarkup = (project) => `<div class="pathway-project"><div><strong>${escapeHTML(project.title)}</strong><span>${escapeHTML(project.organization)} · ${escapeHTML(project.time)}</span><p>${escapeHTML(project.description)}</p></div><button class="text-link" type="button" data-explore-project="${escapeHTML(project.id)}">View project ${icon("arrow-up-right")}</button></div>`;
  const gapCards = gaps.map((skill) =>
    `<article class="pathway-card"><h4>${escapeHTML(skill.name)}</h4><p class="pathway-context">Posting mentions: “${escapeHTML(skill.context)}”</p><p class="result-desc">No matching demo evidence yet. This does not mean you lack this skill.</p>${skill.projects.length ? `<div class="pathway-projects"><strong>Fictional practice ideas</strong>${skill.projects.slice(0, 2).map(projectMarkup).join("")}${skill.projects.length > 2 ? `<details class="pathway-more"><summary>Show ${skill.projects.length - 2} more ${skill.projects.length === 3 ? "idea" : "ideas"}</summary>${skill.projects.slice(2).map(projectMarkup).join("")}</details>` : ""}</div>` : `<p class="result-desc">No related demo project yet. Consider another way to practise or document this skill.</p>`}</article>`,
  ).join("");
  target.className = "";
  target.innerHTML = `<div class="pathway-intro" role="status"><strong>Your skill pathway</strong><p>We found ${skills.length} skill ${skills.length === 1 ? "hint" : "hints"} in this text: ${supported.length} with related demo evidence and ${gaps.length} to explore. Keywords can miss context or requirements.</p></div>${skills.length ? `<section class="pathway-section"><h3>Evidence you have <span>${supported.length}</span></h3>${evidenceCards || '<p class="pathway-empty">No related signed demo evidence found for these skills yet.</p>'}</section><section class="pathway-section"><h3>Skills to explore <span>${gaps.length}</span></h3>${gapCards || '<p class="pathway-empty">No evidence gaps among the skills we recognized. Review the full posting for anything missed.</p>'}</section>` : `<p class="pathway-empty">No recognizable skill keywords found. Try the full job posting or review its requirements yourself.</p>`}<p class="pathway-note">Projects are fictional practice ideas, not live opportunities. Only create a demo vouch for work you want to simulate; completing a project here does not create evidence or guarantee a job.</p>`;
  refreshIcons();
  announce(`Student pathway updated: ${supported.length} skills with related evidence and ${gaps.length} to explore.`);
}

function renderLens() {
  if (!lastLens) return;
  const renderId = ++lensRender;
  const target = document.querySelector("#lens-results");
  document.querySelector("#lens-disclaimer-text").textContent =
    lensAudience === "student" ? DISCLAIMER_STUDENT : lastLens.mode === "ai" ? DISCLAIMER_AI : DISCLAIMER_OFFLINE;
  if (lensAudience === "student") renderStudentPathway(lastLens.input, target, renderId);
  else if (lastLens.mode === "ai") renderAiLens(lastLens.data, target);
  else keywordLens(lastLens.input, target, renderId);
  refreshIcons();
}

function renderAiLens(data, target) {
  const { stats } = data;
  const summary = `<div class="lens-summary" role="status"><strong>${stats.matched} of ${stats.total}</strong> requirement${stats.total === 1 ? "" : "s"} ${stats.matched === 1 ? "has" : "have"} verified evidence <span class="lens-source">AI · ${escapeHTML(data.model)} · ${stats.validCredentials} signed credential${stats.validCredentials === 1 ? "" : "s"} checked${data.cached ? " · saved result" : ""}</span></div>`;
  const rows = data.requirements
    .map((requirement) => {
      if (!requirement.matches.length)
        return gapMarkup(requirement.text, requirement.kind, requirement.suggestedProjects);
      return `<div class="lens-result"><div class="lens-result-top"><span class="result-status">${icon("check")}</span><h3>${escapeHTML(requirement.text)} <span class="kind-tag">${escapeHTML(requirement.kind)}</span></h3></div>${requirement.matches
        .map(
          (match) =>
            `<div class="lens-evidence"><p class="result-desc"><span class="evidence-tag ${match.evidenceType === "action" ? "action" : "praise"}">${match.evidenceType === "action" ? "WHAT THEY DID" : "PRAISE"}</span> “${escapeHTML(match.quote)}” <span class="lens-witness">— ${escapeHTML(match.witness)}, via ${escapeHTML(match.issuer)}</span></p>${match.why ? `<p class="result-desc lens-why">${escapeHTML(match.why)}</p>` : ""}<button class="text-link" type="button" data-credential="${escapeHTML(match.credentialId)}">See the signed evidence ${icon("arrow-up-right")}</button></div>`,
        )
        .join("")}</div>`;
    })
    .join("");
  const rejected = data.rejected?.length
    ? `<details class="lens-rejected"><summary>Show what the AI proposed that we rejected (${data.rejected.length})</summary>${data.rejected
        .map(
          (item) =>
            `<div class="rejected-item"><p><strong>${escapeHTML(item.requirement)}</strong></p><p class="result-desc">Proposed: “${escapeHTML(item.quote || "(no quote)")}” from credential ${escapeHTML(item.credentialId || "?")}</p><p class="result-desc rejected-reason">${icon("x")} ${escapeHTML(item.reason)}</p></div>`,
        )
        .join("")}</details>`
    : `<p class="lens-clean">Grounding check: every AI-proposed quote matched its signed credential word-for-word.</p>`;
  target.className = "";
  target.innerHTML = summary + rows + rejected;
  announce(`${stats.matched} of ${stats.total} requirements have verified evidence.`);
}

async function analyzeJob() {
  const requestId = ++lensRequest;
  ++lensRender;
  lastLens = undefined;
  const input = document.querySelector("#job-description").value.trim();
  const target = document.querySelector("#lens-results");
  const button = document.querySelector("#analyze-job");
  if (!input) {
    button.disabled = false;
    target.removeAttribute("aria-busy");
    target.className = "lens-empty";
    target.innerHTML =
      "<h2>Add a job posting first.</h2><p>Paste the whole posting, or pick an example.</p>";
    return;
  }
  target.className = "lens-empty";
  target.setAttribute("aria-busy", "true");
  target.innerHTML = `<span class="lens-spinner">${icon("loader-circle")}</span><h2>Reading the posting…</h2><p>Extracting requirements and checking every quote against signed credentials.</p>`;
  refreshIcons();
  button.disabled = true;
  let data;
  try {
    const response = await fetch("/api/lens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        posting: input,
        credentials,
        issuerPublicKey: issuer?.publicKey ?? "",
      }),
    });
    data = await response.json();
    if (!response.ok) throw new Error(data.error || "Lens request failed");
  } catch {
    data = { fallback: true };
  } finally {
    if (requestId === lensRequest) {
      button.disabled = false;
      target.removeAttribute("aria-busy");
    }
  }
  if (requestId !== lensRequest) return;
  lastLens =
    !data.fallback && Array.isArray(data.requirements)
      ? { mode: "ai", data, input }
      : { mode: "offline", input };
  renderLens();
}

// Offline fallback: the original regex lens, clearly labelled.
async function keywordLens(input, target, renderId) {
  const lines = input
    .split(/\n+|(?<=[.!?])\s+/)
    .map((line) => line.replace(/^\s*[-•*]\s*/, "").trim())
    .filter((line) => line.length > 3)
    .slice(0, 20);
  const validCredentials = await verifiedCredentials();
  if (renderId !== lensRender || lensAudience !== "employer") return;
  target.className = "";
  target.innerHTML = `<div class="lens-summary offline" role="status"><strong>Offline keyword matching</strong> <span class="lens-source">The AI lens is unavailable, so this uses simple keyword rules. Results are rougher.</span></div>` + lines
    .map((line) => {
      const matched = validCredentials
        .flatMap((credential) =>
          credential.payload.mappings.map((mapping) => ({
            ...mapping,
            index: credential.index,
          })),
        )
        .find((mapping) => skillTerms[mapping.skill]?.test(line) &&
          (!/\bsql\b/i.test(line) || /\bsql\b/i.test(mapping.quote)));
      if (!matched) return gapMarkup(line, "", keywordSuggestions(line), true);
      return `<div class="lens-result"><div class="lens-result-top"><span class="result-status">${icon("check")}</span><h3>${escapeHTML(line)}</h3></div><p class="result-desc">${escapeHTML(matched.skill)} · “${escapeHTML(matched.quote)}”</p><button class="text-link" type="button" data-credential="${matched.index}">See the signed evidence ${icon("arrow-up-right")}</button></div>`;
    })
    .join("");
  refreshIcons();
  announce(`Evidence map updated for ${lines.length} requirements.`);
}

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) showView(viewButton.dataset.view);
  const projectButton = event.target.closest("[data-project]");
  if (projectButton) {
    document.querySelector("#vouch-task").value = projectButton.dataset.project;
    showView("vouch");
  }
  const exploreButton = event.target.closest("[data-explore-project]");
  if (exploreButton) {
    showView("projects");
    const project = [...document.querySelectorAll("#all-projects [data-project-card]")].find((card) => card.dataset.projectCard === exploreButton.dataset.exploreProject);
    project?.scrollIntoView({ block: "center" });
    project?.focus({ preventScroll: true });
  }
  const credentialButton = event.target.closest("[data-credential]");
  if (credentialButton)
    openCredential(Number(credentialButton.dataset.credential));
  const shareButton = event.target.closest("[data-share]");
  if (shareButton) {
    shareToken = credentials[Number(shareButton.dataset.share)];
    document.querySelector("#share-result").hidden = true;
    document.querySelector("#share-error").textContent = "";
    document.querySelector("#publish-credential").hidden = false;
    document.querySelector("#share-dialog").showModal();
  }
  const audienceButton = event.target.closest("[data-audience]");
  if (audienceButton && audienceButton.dataset.audience !== lensAudience) {
    lensAudience = audienceButton.dataset.audience;
    document.querySelectorAll("[data-audience]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.audience === lensAudience));
    });
    renderLens();
    announce(lensAudience === "student" ? "Showing student view with project suggestions." : "Showing employer view.");
  }
});

document
  .querySelector(".brand")
  .addEventListener("click", () => showView("overview"));
window.addEventListener("hashchange", () => showView(location.hash.slice(1)));
document
  .querySelector("#close-dialog")
  .addEventListener("click", () =>
    document.querySelector("#credential-dialog").close(),
  );
document.querySelector("#tamper-token").addEventListener("click", () => {
  if (!selectedCredential) return;
  document.querySelector("#credential-token").value =
    alterCredential(selectedCredential);
  document.querySelector("#verify-result").textContent =
    "Credential changed. Check its signature.";
});
document.querySelector("#verify-token").addEventListener("click", async () => {
  const result = await verifyCredential(
    document.querySelector("#credential-token").value.trim(),
    issuer.publicKey,
  );
  document.querySelector("#verify-result").textContent = result.valid
    ? "Signature valid against the server’s demo issuer key."
    : "Not valid: the signature does not match the credential or trusted demo key.";
});
document.querySelector("#close-share").addEventListener("click", () => document.querySelector("#share-dialog").close());
document.querySelector("#share-dialog").addEventListener("close", () => { shareToken = undefined; });
document.querySelector("#publish-credential").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  document.querySelector("#share-error").textContent = "";
  try {
    const result = await demoRequest("/api/demo-credentials/share", { token: shareToken });
    const link = document.querySelector("#share-link");
    link.href = result.url;
    link.textContent = result.url;
    document.querySelector("#share-qr").src = result.qrUrl;
    const linkedIn = new URL("https://www.linkedin.com/sharing/share-offsite/");
    linkedIn.searchParams.set("url", result.url);
    document.querySelector("#share-linkedin").href = linkedIn.href;
    document.querySelector("#native-share").hidden = !navigator.share;
    document.querySelector("#share-result").hidden = false;
    button.hidden = true;
  } catch (error) {
    document.querySelector("#share-error").textContent = error.message;
  } finally { button.disabled = false; }
});
document.querySelector("#copy-share").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(document.querySelector("#share-link").href);
    document.querySelector("#share-error").textContent = "Link copied.";
  } catch {
    document.querySelector("#share-error").textContent = "Copy unavailable. Select and copy the link above.";
  }
});
document.querySelector("#native-share").addEventListener("click", async () => {
  try {
    await navigator.share({ title: "Proofly fictional demo credential", text: "View this fictional demo credential on Proofly.", url: document.querySelector("#share-link").href });
  } catch (error) {
    if (error.name !== "AbortError") document.querySelector("#share-error").textContent = "Could not open sharing. Copy the link instead.";
  }
});
document.querySelector("#download-share-card").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  document.querySelector("#share-error").textContent = "";
  try {
    const result = await verifyCredential(shareToken, issuer.publicKey);
    if (!result.valid) throw new Error("This demo credential could not be verified.");
    const link = document.querySelector("#share-link").href;
    const blob = await makeShareCard(result.payload, link, document.querySelector("#share-qr").src);
    const objectUrl = URL.createObjectURL(blob);
    const download = document.createElement("a");
    download.href = objectUrl;
    download.download = "proofly-demo-credential.png";
    download.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    document.querySelector("#share-error").textContent = "Image downloaded. To share on Instagram, upload it there and add the verification link separately.";
  } catch (error) {
    document.querySelector("#share-error").textContent = error.message || "Could not create the share image.";
  } finally { button.disabled = false; }
});
document.querySelector("#example-job").addEventListener("click", () => {
  document.querySelector("#job-description").value = jobExample;
  document.querySelector("#job-select").value = "";
  document.querySelector("#job-source").textContent = "";
  analyzeJob();
});

async function loadJobPostings() {
  try {
    const response = await fetch("/api/jobs");
    if (!response.ok) return;
    const data = await response.json();
    jobPostings = Array.isArray(data.jobs) ? data.jobs : [];
    jobDemand = data.demand?.total ? data.demand : undefined;
    renderLens();
    if (!jobPostings.length) return;
    const select = document.querySelector("#job-select");
    select.insertAdjacentHTML(
      "beforeend",
      jobPostings
        .map(
          (job, index) =>
            `<option value="${index}">${escapeHTML(job.title)} — ${escapeHTML(job.company || "Unknown employer")}</option>`,
        )
        .join(""),
    );
    document.querySelector("#job-picker").hidden = false;
  } catch {
    /* static hosting or offline: picker stays hidden */
  }
}

document.querySelector("#job-select").addEventListener("change", (event) => {
  const job = jobPostings[Number(event.target.value)];
  const source = document.querySelector("#job-source");
  if (!job || event.target.value === "") {
    source.textContent = "";
    return;
  }
  document.querySelector("#job-description").value =
    `${job.title} — ${job.company}, ${job.location}\n\n${job.description}`;
  source.innerHTML = `Live posting via Adzuna${job.snippet ? " (Adzuna shares a short excerpt; paste the full text for a fuller check)" : ""}. ${job.url ? `<a href="${escapeHTML(job.url)}" target="_blank" rel="noopener noreferrer">Open the full posting</a>` : ""}`;
  analyzeJob();
});
document.querySelector("#job-description").addEventListener("input", () => {
  ++lensRequest;
  ++lensRender;
  lastLens = undefined;
  const target = document.querySelector("#lens-results");
  target.className = "lens-empty";
  target.removeAttribute("aria-busy");
  target.innerHTML = "<h2>Posting changed.</h2><p>Select Find evidence to update your results.</p>";
  document.querySelector("#analyze-job").disabled = false;
});
document.querySelector("#analyze-job").addEventListener("click", analyzeJob);

document.querySelector("#badge-lookup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const output = document.querySelector("#badge-lookup-result");
  const button = form.querySelector('button[type="submit"]');
  output.hidden = false;
  output.textContent = "Checking the provider’s public record…";
  button.disabled = true;
  try {
    const response = await fetch("/api/badgr/assertion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Badge lookup unavailable.");
    const messages = {
      found: "Provider record found. Recipient ownership and issuer trust are not verified.",
      revoked: "The provider reports that this assertion is revoked.",
      expired: "This assertion has expired.",
      not_found: "No public assertion was found in this region.",
    };
    output.textContent = messages[result.status] || "The badge status could not be determined.";
    if (result.status === "found" && result.badgeName) output.textContent += ` Badge: ${result.badgeName}.`;
  } catch (error) {
    output.textContent = error.message || "Badge lookup unavailable.";
  } finally {
    button.disabled = false;
  }
});

document
  .querySelector("#vouch-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = document.querySelector("#vouch-error");
    const skills = [
      ...document.querySelectorAll('input[name="skill"]:checked'),
    ].map((input) => input.value);
    const transcript = document.querySelector("#vouch-transcript").value.trim();
    if (!skills.length) {
      error.textContent = "Choose at least one skill supported by your words.";
      return;
    }
    if (!transcript || !document.querySelector("#vouch-name").value.trim()) {
      error.textContent = "Add your first name and your words.";
      return;
    }
    if (!issuer || !database) {
      error.textContent = "Signing is unavailable in this browser.";
      return;
    }
    error.textContent = "";
    const payload = {
      title: document.querySelector("#vouch-task").value,
      witness: document.querySelector("#vouch-name").value.trim(),
      transcript,
      issuer: "Community Centre (fictional demo)",
      student: "Priya Sharma",
      example: false,
      issuedAt: new Date().toISOString().slice(0, 10),
      mappings: skills.map((skill) => ({ skill, quote: transcript })),
    };
    openApproval(payload, "form");
  });

// Coordinator review dialog, shared by the standard form and easy (kiosk) mode.
function openApproval(payload, source) {
  pendingVouch = payload;
  approvalSource = source;
  document.querySelector("#approval-task").textContent = payload.title;
  document.querySelector("#approval-witness").textContent =
    `Confirmed by: ${payload.witness}`;
  document.querySelector("#approval-quote").textContent =
    `“${payload.transcript}”`;
  document.querySelector("#approval-skills").textContent =
    `Selected skills: ${payload.mappings.map((m) => m.skill).join(", ")}`;
  document.querySelector("#approval-error").textContent = "";
  document.querySelector("#approval-dialog").showModal();
}

document
  .querySelector("#cancel-approval")
  .addEventListener("click", () =>
    document.querySelector("#approval-dialog").close(),
  );
document
  .querySelector("#back-to-vouch")
  .addEventListener("click", () =>
    document.querySelector("#approval-dialog").close(),
  );
document.querySelector("#approval-dialog").addEventListener("close", () => {
  pendingVouch = undefined;
});
document
  .querySelector("#approve-vouch")
  .addEventListener("click", async (event) => {
    if (!pendingVouch) return;
    const fromKiosk = approvalSource === "kiosk";
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const token = await signDemo(pendingVouch);
      const updated = [...credentials, token];
      await writeState("credentials", updated);
      credentials = updated;
      document.querySelector("#approval-dialog").close();
      await renderCredentials();
      renderLens();
      if (fromKiosk) {
        kiosk.step = kioskSteps.indexOf("done");
        renderKiosk();
      } else {
        document.querySelector("#vouch-form").reset();
        showView("credentials");
      }
      announce("Your demo credential was signed and saved on this device.");
    } catch (failure) {
      document.querySelector("#approval-error").textContent =
        `Could not issue the credential: ${failure.message}`;
    } finally {
      button.disabled = false;
    }
  });

// ---- Speech-to-text, shared by the standard form and easy (kiosk) mode ----
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;
let activeRecognition;

// Appends what the person says to `field`. Calls onState("listening" | "stopped" | "error", message).
function startDictation(field, onState, { continuous = false } = {}) {
  stopDictation();
  if (!SpeechRecognition) {
    onState(
      "error",
      "Voice input is not available in this browser. Please type your words instead.",
    );
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = "en-CA";
  recognition.interimResults = false;
  recognition.continuous = continuous;
  recognition.onstart = () =>
    onState(
      "listening",
      "Listening. Speak now; your browser may send audio to its speech provider.",
    );
  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (!event.results[i].isFinal) continue;
      const words = event.results[i][0].transcript.trim();
      field.value = `${field.value}${field.value ? " " : ""}${words}`.slice(0, 2000);
    }
    field.dispatchEvent(new Event("input", { bubbles: true }));
  };
  recognition.onerror = () =>
    onState("error", "Voice input did not work. Please try again or type your words.");
  recognition.onend = () => {
    if (activeRecognition === recognition) activeRecognition = undefined;
    onState("stopped", "Please check your words. You can fix anything by typing.");
  };
  try {
    recognition.start();
    activeRecognition = recognition;
  } catch {
    onState("error", "Voice input could not start. Please type your words instead.");
  }
}
function stopDictation() {
  activeRecognition?.stop();
  activeRecognition = undefined;
}

document.querySelector("#voice-button").addEventListener("click", () => {
  const status = document.querySelector("#voice-status");
  startDictation(document.querySelector("#vouch-transcript"), (state, message) => {
    if (state === "stopped") message = "Please review and correct your words before confirming.";
    status.textContent = message;
  });
});

// ---- Easy (kiosk) mode: one large question per screen. No AI involved. ----
// The three answers are joined into the transcript that gets signed, and each skill's quote is one
// whole answer, so every mapping quote appears word-for-word in the transcript (the trust contract).
const kioskQuestions = [
  {
    id: "what",
    prompt: "What did they help you with?",
    hint: "For example: “She showed me how to video call my grandson.”",
    optional: false,
  },
  {
    id: "stuck",
    prompt: "What did they do when something didn't work?",
    hint: "For example: “When the app froze, he stayed calm and tried another way.”",
    optional: true,
  },
  {
    id: "now",
    prompt: "What can you do now that you couldn't before?",
    hint: "For example: “Now I call my family every Sunday by myself.”",
    optional: true,
  },
];
const kioskSkillLabels = {
  Communication: "Explained things clearly",
  Digital: "Used a phone, tablet or computer well",
  "Problem solving": "Figured out what was wrong",
  Collaboration: "Worked well with me or with others",
  Adaptability: "Tried another way when something didn't work",
  Writing: "Wrote things down for me",
  Reading: "Read and explained instructions",
  Numeracy: "Worked with numbers, money or a budget",
  "Creativity and innovation": "Came up with a new idea",
};
// When no keyword matches, which answer is the most natural evidence for a skill.
const kioskSkillAnswer = {
  Digital: "what",
  Communication: "what",
  Writing: "what",
  Reading: "what",
  Numeracy: "what",
  "Problem solving": "stuck",
  Adaptability: "stuck",
  Collaboration: "stuck",
  "Creativity and innovation": "stuck",
};
const kioskSteps = ["project", "name", ...kioskQuestions.map((q) => q.id), "review", "skills", "done"];
let kiosk;
function resetKiosk() {
  kiosk = { step: 0, project: "", name: "", answers: {}, skills: new Set(), editing: false };
}
resetKiosk();

// Tidy an answer once, before the read-back, so the person confirms exactly the words that get signed.
const tidyAnswer = (text) => {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const sentence = clean[0].toUpperCase() + clean.slice(1);
  return /[.!?]["”']?$/.test(sentence) ? sentence : `${sentence}.`;
};
const kioskAnswerList = () =>
  kioskQuestions.map((q) => ({ ...q, answer: kiosk.answers[q.id] ?? "" })).filter((q) => q.answer);
const kioskTranscript = () => kioskAnswerList().map((q) => q.answer).join(" ");

function kioskQuote(skill) {
  const answers = kioskAnswerList();
  const matched = answers.find((q) => skillTerms[skill]?.test(q.answer));
  const preferred = answers.find((q) => q.id === kioskSkillAnswer[skill]);
  return (matched ?? preferred ?? answers[0]).answer;
}

const kioskBack = () =>
  kiosk.step > 0
    ? `<button class="kiosk-button secondary" type="button" data-kiosk="back">${icon("arrow-left")} Back</button>`
    : "";

function kioskScreen() {
  const id = kioskSteps[kiosk.step];
  const projectOptions = [...document.querySelectorAll("#vouch-task option")]
    .map((option) => option.value)
    .filter(Boolean);
  if (id === "project")
    return `<h1 id="kiosk-title" tabindex="-1">Which activity was this?</h1>
      <p class="kiosk-hint">Tap one.</p>
      <div class="kiosk-choices">${projectOptions
        .map(
          (title) =>
            `<button class="kiosk-choice" type="button" data-kiosk="project" data-value="${escapeHTML(title)}" aria-pressed="${kiosk.project === title}">${escapeHTML(title)}</button>`,
        )
        .join("")}</div>`;
  if (id === "name")
    return `<h1 id="kiosk-title" tabindex="-1">What is your first name?</h1>
      <label class="sr-only" for="kiosk-input">Your first name</label>
      <input class="kiosk-input" id="kiosk-input" type="text" maxlength="40" autocomplete="given-name" value="${escapeHTML(kiosk.name)}" />
      <div class="kiosk-actions">${kioskBack()}<button class="kiosk-button primary" type="button" data-kiosk="next">Next ${icon("arrow-right")}</button></div>`;
  const question = kioskQuestions.find((q) => q.id === id);
  if (question)
    return `<h1 id="kiosk-title" tabindex="-1">${escapeHTML(question.prompt)}</h1>
      <p class="kiosk-hint">${escapeHTML(question.hint)}</p>
      <button class="kiosk-mic" type="button" data-kiosk="mic" aria-pressed="false">
        ${icon("mic")}<span>Tap and speak</span>
      </button>
      <label class="kiosk-or" for="kiosk-input">Or type your answer</label>
      <textarea class="kiosk-input" id="kiosk-input" rows="4" maxlength="600">${escapeHTML(kiosk.answers[id] ?? "")}</textarea>
      <div class="kiosk-actions">${kioskBack()}${
        question.optional
          ? `<button class="kiosk-button secondary" type="button" data-kiosk="skip">Skip this question</button>`
          : ""
      }<button class="kiosk-button primary" type="button" data-kiosk="next">Next ${icon("arrow-right")}</button></div>`;
  if (id === "review")
    return `<h1 id="kiosk-title" tabindex="-1">Is this right?</h1>
      <p class="kiosk-hint">This is exactly what will be saved, in your words.</p>
      <div class="kiosk-readback">${kioskAnswerList()
        .map(
          (q) => `<div class="kiosk-readback-item">
            <p class="kiosk-readback-question">${escapeHTML(q.prompt)}</p>
            <blockquote>${escapeHTML(q.answer)}</blockquote>
            <button class="kiosk-link" type="button" data-kiosk="edit" data-value="${q.id}">Change this answer</button>
          </div>`,
        )
        .join("")}</div>
      ${"speechSynthesis" in window ? `<button class="kiosk-button secondary wide" type="button" data-kiosk="speak">${icon("volume-2")} Read it out loud to me</button>` : ""}
      <p class="kiosk-consent">Tapping “Yes” means these are your words and you agree to include them in this demo credential.</p>
      <div class="kiosk-actions">${kioskBack()}<button class="kiosk-button primary" type="button" data-kiosk="confirm">${icon("check")} Yes, that's right</button></div>`;
  if (id === "skills") {
    const transcript = kioskTranscript();
    return `<h1 id="kiosk-title" tabindex="-1">What did you see them do?</h1>
      <p class="kiosk-hint">Tap any that are true. Each one will be linked to your own words.</p>
      <div class="kiosk-choices skills">${Object.keys(kioskSkillLabels)
        .map((skill) => {
          const mentioned = skillTerms[skill]?.test(transcript);
          return `<button class="kiosk-choice" type="button" data-kiosk="skill" data-value="${escapeHTML(skill)}" aria-pressed="${kiosk.skills.has(skill)}">
            <span class="kiosk-choice-title">${escapeHTML(kioskSkillLabels[skill])}</span>
            <span class="kiosk-choice-meta">${escapeHTML(skill)}${mentioned ? " · in your words" : ""}</span>
          </button>`;
        })
        .join("")}</div>
      <div class="kiosk-actions">${kioskBack()}<button class="kiosk-button primary" type="button" data-kiosk="send">Send to the coordinator ${icon("arrow-right")}</button></div>`;
  }
  return `<h1 id="kiosk-title" tabindex="-1">Thank you, ${escapeHTML(kiosk.name)}.</h1>
    <p class="kiosk-hint">Your words are now a signed demo credential. You helped someone show what they can do.</p>
    <div class="kiosk-actions"><button class="kiosk-button primary" type="button" data-kiosk="restart">Start a new vouch</button></div>`;
}

function renderKiosk({ focus = true } = {}) {
  const container = document.querySelector("#kiosk-step");
  if (!container) return;
  const total = kioskSteps.length - 1; // "done" is not a step the person does
  const id = kioskSteps[kiosk.step];
  document.querySelector("#kiosk-progress").textContent =
    id === "done" ? "" : `Step ${kiosk.step + 1} of ${total}`;
  document.querySelector("#kiosk-status").textContent = "";
  container.innerHTML = kioskScreen();
  refreshIcons();
  if (focus) document.querySelector("#kiosk-title")?.focus();
}

function kioskSay(message) {
  document.querySelector("#kiosk-status").textContent = message;
}

// Save whatever is in the current input; returns false if a required answer is missing.
function kioskSaveStep() {
  const id = kioskSteps[kiosk.step];
  const input = document.querySelector("#kiosk-input");
  if (id === "name") {
    kiosk.name = input.value.trim();
    if (!kiosk.name) return kioskSay("Please type your first name."), false;
  }
  const question = kioskQuestions.find((q) => q.id === id);
  if (question) {
    kiosk.answers[id] = tidyAnswer(input.value);
    if (!kiosk.answers[id] && !question.optional)
      return kioskSay("Please say or type a few words."), false;
  }
  return true;
}

function kioskGo(step) {
  stopDictation();
  window.speechSynthesis?.cancel();
  kiosk.step = Math.max(0, Math.min(step, kioskSteps.length - 1));
  renderKiosk();
}

document.querySelector("#kiosk").addEventListener("click", (event) => {
  const button = event.target.closest("[data-kiosk]");
  if (!button) return;
  const action = button.dataset.kiosk;
  const value = button.dataset.value;
  if (action === "back") {
    if (kioskSteps[kiosk.step] !== "review" && document.querySelector("#kiosk-input")) kioskSaveStep();
    kioskGo(kiosk.step - 1);
  } else if (action === "project") {
    kiosk.project = value;
    kioskGo(kiosk.step + 1);
  } else if (action === "next") {
    if (!kioskSaveStep()) return;
    // After "Change this answer", go straight back to the read-back.
    if (kiosk.editing && kioskAnswerList().length) return (kiosk.editing = false), kioskGo(kioskSteps.indexOf("review"));
    kioskGo(kiosk.step + 1);
  } else if (action === "skip") {
    kiosk.answers[kioskSteps[kiosk.step]] = "";
    kioskGo(kiosk.step + 1);
  } else if (action === "mic") {
    if (activeRecognition) return stopDictation();
    startDictation(
      document.querySelector("#kiosk-input"),
      (state, message) => {
        const listening = state === "listening";
        button.setAttribute("aria-pressed", String(listening));
        button.querySelector("span").textContent = listening ? "Listening… tap to stop" : "Tap and speak";
        kioskSay(message);
      },
      { continuous: true },
    );
  } else if (action === "edit") {
    kiosk.editing = true;
    kioskGo(kioskSteps.indexOf(value));
  } else if (action === "speak") {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(kioskTranscript());
    utterance.lang = "en-CA";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  } else if (action === "confirm") {
    kioskGo(kioskSteps.indexOf("skills"));
  } else if (action === "skill") {
    if (kiosk.skills.has(value)) kiosk.skills.delete(value);
    else kiosk.skills.add(value);
    button.setAttribute("aria-pressed", String(kiosk.skills.has(value)));
  } else if (action === "send") {
    if (!kiosk.skills.size) return kioskSay("Please tap at least one thing you saw them do.");
    if (!issuer || !database) return kioskSay("Signing is unavailable in this browser.");
    const transcript = kioskTranscript();
    const payload = {
      title: kiosk.project,
      witness: kiosk.name,
      transcript,
      issuer: "Community Centre (fictional demo)",
      student: "Priya Sharma",
      example: false,
      issuedAt: new Date().toISOString().slice(0, 10),
      mappings: [...kiosk.skills].map((skill) => ({ skill, quote: kioskQuote(skill) })),
    };
    // Same grounding rule the verifier enforces: every quote is verbatim in the transcript.
    if (!payload.mappings.every((m) => transcript.includes(m.quote)))
      return kioskSay("Something went wrong linking your words. Please go back and try again.");
    openApproval(payload, "kiosk");
  } else if (action === "restart") {
    resetKiosk();
    renderKiosk();
  }
});

// Enter moves on from the name field (Shift+Enter still makes a new line in answers).
document.querySelector("#kiosk").addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.target.id !== "kiosk-input") return;
  if (event.target.tagName === "TEXTAREA") return;
  event.preventDefault();
  if (kioskSaveStep()) kioskGo(kiosk.step + 1);
});

renderProjects();
showView(location.hash.slice(1) || "overview");
initialize();
loadJobPostings();

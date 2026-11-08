import {
  createIssuer,
  signCredential,
  verifyCredential,
  alterCredential,
} from "./trust.mjs";
import { projects, keywordProjectSuggestions } from "./lens/projects.mjs";
import { skillTerms } from "./lens/skills.mjs";
import { buildStudentPathway } from "./lens/student-pathway.mjs";

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

async function initialize() {
  try {
    if (!window.isSecureContext || !crypto.subtle)
      throw new Error("Use localhost or HTTPS for credential signing.");
    database = await openDatabase();
    issuer = await readState("issuer");
    if (!issuer) {
      issuer = await createIssuer();
      await writeState("issuer", issuer);
    }
    const stored = await readState("credentials");
    if (stored === undefined) {
      credentials = [await signCredential(examples, issuer)];
      await writeState("credentials", credentials);
    } else credentials = Array.isArray(stored) ? stored : [];
    await renderCredentials();
    renderLens();
  } catch (error) {
    document.querySelector(".demo-notice span").textContent =
      `Credential storage or signing is unavailable: ${error.message}. Use a supported browser on localhost or HTTPS.`;
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
            `<article class="credential-full"><div class="credential-full-top"><span class="badge-symbol">${icon("award")}</span><div><h3>${escapeHTML(payload.title)}</h3><p>${escapeHTML(payload.issuer)} · ${escapeHTML(payload.issuedAt)} · Demo</p></div><span class="verified">${icon("shield-check")} SIGNATURE VALID</span></div><div class="credential-quote">“${escapeHTML(payload.transcript)}”<strong>— ${escapeHTML(payload.witness)}, community member · ${payload.example ? "fictional example" : "demo entry"}</strong></div>${skillsMarkup(payload)}<div class="credential-actions"><span class="project-meta">EVIDENCE ATTACHED · LOCAL DEMO</span><button class="text-link" type="button" data-credential="${index}">View credential ${icon("arrow-up-right")}</button></div></article>`,
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
    `<div class="dialog-detail"><h3>${escapeHTML(payload.title)}</h3><p><strong>Issuer:</strong> ${escapeHTML(payload.issuer)} · demo identity</p><p><strong>Witness:</strong> ${escapeHTML(payload.witness)} ${payload.example ? "(fictional example)" : "(demo entry)"}</p><p><strong>Student:</strong> ${escapeHTML(payload.student)}</p><p><strong>Signature:</strong> valid against this browser's demo issuer key</p></div><div class="credential-quote">“${escapeHTML(payload.transcript)}”</div>${payload.mappings.map((mapping) => `<p><span class="skill-chip">${escapeHTML(mapping.skill)}</span> <span class="result-desc">“${escapeHTML(mapping.quote)}”</span></p>`).join("")}`;
  document.querySelector("#credential-token").value = token;
  document.querySelector("#verify-result").textContent =
    "Signature valid against this browser’s demo issuer key.";
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
  const gapCards = gaps.map((skill) =>
    `<article class="pathway-card"><h4>${escapeHTML(skill.name)}</h4><p class="pathway-context">Posting mentions: “${escapeHTML(skill.context)}”</p><p class="result-desc">No matching demo evidence yet. This does not mean you lack this skill.</p>${skill.projects.length ? `<div class="pathway-projects"><strong>Fictional practice ideas</strong>${skill.projects.map((project) => `<div class="pathway-project"><div><strong>${escapeHTML(project.title)}</strong><span>${escapeHTML(project.organization)} · ${escapeHTML(project.time)}</span><p>${escapeHTML(project.description)}</p></div><button class="text-link" type="button" data-explore-project="${escapeHTML(project.id)}">View project ${icon("arrow-up-right")}</button></div>`).join("")}</div>` : `<p class="result-desc">No related demo project yet. Consider another way to practise or document this skill.</p>`}</article>`,
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
    ? "Signature valid against this browser’s demo issuer key."
    : "Not valid: the signature does not match the credential or trusted demo key.";
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
    pendingVouch = payload;
    document.querySelector("#approval-task").textContent = payload.title;
    document.querySelector("#approval-witness").textContent =
      `Confirmed by: ${payload.witness}`;
    document.querySelector("#approval-quote").textContent =
      `“${payload.transcript}”`;
    document.querySelector("#approval-skills").textContent =
      `Selected skills: ${skills.join(", ")}`;
    document.querySelector("#approval-error").textContent = "";
    document.querySelector("#approval-dialog").showModal();
  });

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
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const token = await signCredential(pendingVouch, issuer);
      const updated = [...credentials, token];
      await writeState("credentials", updated);
      credentials = updated;
      document.querySelector("#approval-dialog").close();
      document.querySelector("#vouch-form").reset();
      await renderCredentials();
      renderLens();
      showView("credentials");
      announce("Your demo credential was signed and saved on this device.");
    } catch (failure) {
      document.querySelector("#approval-error").textContent =
        `Could not issue the credential: ${failure.message}`;
    } finally {
      button.disabled = false;
    }
  });

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;
document.querySelector("#voice-button").addEventListener("click", () => {
  const status = document.querySelector("#voice-status");
  if (!SpeechRecognition) {
    status.textContent =
      "Speech recognition is not available in this browser. Please type your words instead.";
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = "en-CA";
  recognition.interimResults = false;
  recognition.onstart = () => {
    status.textContent =
      "Listening. Speak now; your browser may send audio to its speech provider.";
  };
  recognition.onresult = (event) => {
    const field = document.querySelector("#vouch-transcript");
    field.value =
      `${field.value}${field.value ? " " : ""}${event.results[0][0].transcript}`.slice(
        0,
        2000,
      );
    status.textContent =
      "Please review and correct your words before confirming.";
  };
  recognition.onerror = () => {
    status.textContent =
      "Voice input did not work. Please try again or type your words.";
  };
  try {
    recognition.start();
  } catch {
    status.textContent =
      "Voice input could not start. Please type your words instead.";
  }
});

renderProjects();
showView(location.hash.slice(1) || "overview");
initialize();
loadJobPostings();

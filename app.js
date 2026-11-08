// The browser never decides whether a credential is authentic: it asks the server (/api/credentials/verify),
// which checks signatures against its trusted issuer registry and its issuance records.
import { alterCredential } from "./trust.mjs";
import { readApiResponse } from "./api-response.mjs";
import { projects, communityVenues, calgaryAreas, atVenue } from "./lens/projects.mjs";
import { skillTerms } from "./lens/skills.mjs";
import { employerJobSamples } from "./lens/employer-job-samples.mjs";
import { buildStudentPathway } from "./lens/student-pathway.mjs";
import { makeShareCard } from "./verification/share-card.mjs";
import { linkedinCaption } from "./verification/linkedin-caption.mjs";
import { createExplore } from "./map/explore-map.mjs";

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
import { jobExample } from "./lens/job-example.mjs";
let jobPostings = [];
let jobDemand; // { total, counts: { [skill]: n } } from /api/jobs
let fictionalStudentProfiles = [];
let fictionalStudentCredentials = [];

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
  lens: "Student skills lens",
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
// Community needs posted from the coordinator demo form, saved in this browser like credentials.
let postedProjects = [];
const catalog = () => [...projects, ...postedProjects];
const skillNames = Object.keys(skillTerms);
let credentials = [];
let selectedCredential;
let pendingVouch;
let approvalSource = "form"; // "form" or "kiosk": where to go after issuing
let shareToken;
let linkedinCard;
let linkedinPreviewUrl;
let linkedinFile;

async function demoRequest(path, body) {
  const response = await fetch(path, body === undefined ? { cache: "no-store" } : {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return readApiResponse(response, "Demo credential service is unavailable.");
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

// Server verification results, keyed by token, cached for this page view and refreshed on load.
const verificationResults = new Map();
const UNAVAILABLE = { valid: false, status: "unavailable", message: "Verification is unavailable right now." };

async function verifyWithServer(tokens) {
  const results = [];
  for (let start = 0; start < tokens.length; start += 50) {
    const chunk = tokens.slice(start, start + 50);
    try {
      results.push(...(await demoRequest("/api/credentials/verify", { credentials: chunk })).results);
    } catch {
      results.push(...chunk.map(() => UNAVAILABLE)); // fail closed: never shown as verified
    }
  }
  return results;
}

async function refreshVerification(tokens = credentials, { force = false } = {}) {
  const missing = force ? tokens : tokens.filter((token) => !verificationResults.has(token));
  const results = await verifyWithServer(missing);
  missing.forEach((token, index) => {
    if (results[index]?.status !== "unavailable") verificationResults.set(token, results[index]);
  });
  return tokens.map((token) => verificationResults.get(token) ?? UNAVAILABLE);
}

async function initialize() {
  try {
    if (!window.isSecureContext || !crypto.subtle)
      throw new Error("Use localhost or HTTPS for credential signing.");
    database = await openDatabase();
    await loadPostedProjects();
    issuer = await demoRequest("/api/demo-credentials/issuer"); // { issuerId, name }: no key material
    const stored = await readState("credentials");
    if (stored === undefined) {
      credentials = [await signDemo(examples)];
    } else {
      if (!Array.isArray(stored) || stored.some((token) => typeof token !== "string"))
        throw new Error("Stored credentials have an invalid format.");
      credentials = stored;
      // Credentials from before issuer IDs were signed in: the server re-signs only ones it signed itself.
      try {
        const upgraded = (await demoRequest("/api/demo-credentials/upgrade", { credentials })).credentials;
        if (Array.isArray(upgraded) && upgraded.length === credentials.length) credentials = upgraded;
      } catch { /* keep the saved tokens unchanged */ }
    }
    await writeState("credentials", credentials);
    await loadFictionalStudentProfiles();
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
  if (name === "projects") explore?.onShow();
}

function projectCard(project, { selectable = false } = {}) {
  return `<article class="project-card" data-project-card="${escapeHTML(project.id)}" tabindex="${selectable ? "0" : "-1"}"${selectable ? ' aria-describedby="card-map-hint"' : ""}><span class="project-icon ${project.color}">${icon(project.icon)}</span><div class="project-body"><div class="project-meta">${escapeHTML(project.organization.toUpperCase())} <span>·</span> ${project.time}</div><h3>${escapeHTML(project.title)}</h3><p>${escapeHTML(project.description)}</p><div class="skills-row">${project.skills.map((skill) => `<span class="skill-chip">${escapeHTML(skill)}</span>`).join("")}</div></div><button class="project-arrow" type="button" data-project="${escapeHTML(project.title)}" aria-label="Give a vouch for ${escapeHTML(project.title)}" title="Give a vouch">${icon("arrow-up-right")}</button></article>`;
}

function renderProjects() {
  document.querySelector("#overview-projects").innerHTML = projects
    .slice(0, 2)
    .map(projectCard)
    .join("");
  document.querySelector("#all-projects").innerHTML =
    '<p class="sr-only" id="card-map-hint">Press Enter to show this project on the map.</p>' +
    catalog()
      .map((project) => projectCard(project, { selectable: true }))
      .join("");
  // The vouch task list comes from the same catalog as the project suggestions.
  const task = document.querySelector("#vouch-task");
  const chosenTask = task.value;
  task.innerHTML =
    '<option value="">Choose a project</option>' +
    catalog()
      .map((project) => `<option>${escapeHTML(project.title)}</option>`)
      .join("");
  task.value = chosenTask;
  refreshIcons();
  explore?.refresh();
}

const findProjectsButton = (skill) =>
  skill && skillNames.includes(skill)
    ? `<button class="button subtle gap-explore" type="button" data-skill-filter="${escapeHTML(skill)}" aria-label="Find projects that build this skill: ${escapeHTML(skill)}">Find projects that build this skill <span class="kind-tag">${escapeHTML(skill)}</span> ${icon("map-pin")}</button>`
    : "";

// Every credential with its SERVER verification result; `payload` carries the registry's issuer name.
async function checkedCredentials() {
  if (!issuer) return [];
  const results = await refreshVerification(credentials);
  return credentials.map((token, index) => ({ index, token, ...results[index], payload: results[index].credential }));
}

async function verifiedCredentials() {
  return (await checkedCredentials()).filter((check) => check.valid && check.status === "verified");
}

async function loadFictionalStudentProfiles() {
  const note = document.querySelector("#student-lens-person-note");
  try {
    const response = await fetch("/api/employer/demo-students", { cache: "no-store" });
    const data = await readApiResponse(response, "Fictional students could not be loaded.");
    const profiles = Array.isArray(data.students) ? data.students : [];
    const entries = profiles.flatMap((profile) =>
      (Array.isArray(profile.credentials) ? profile.credentials : [])
        .filter((credential) => typeof credential.token === "string")
        .map((credential) => ({ name: profile.name, token: credential.token })),
    );
    const results = await refreshVerification(entries.map(({ token }) => token), { force: true });
    fictionalStudentCredentials = entries.flatMap((entry, index) => {
      const result = results[index];
      if (!result?.valid || result.status !== "verified" ||
        result.credential?.student !== entry.name || result.credential.demoProfile !== true) return [];
      if (!/^[A-Za-z0-9_-]{16,64}$/.test(result.credentialId || "")) return [];
      return [{
        token: entry.token,
        payload: result.credential,
        sharedUrl: new URL(`/verify/${result.credentialId}`, location.origin).href,
      }];
    });
    const availableNames = new Set(fictionalStudentCredentials.map(({ payload }) => payload.student));
    fictionalStudentProfiles = profiles.filter(({ name }) => availableNames.has(name));
    note.textContent = fictionalStudentProfiles.length
      ? "Choose a fictional student to explore their signed demo evidence. Names are not identity verification."
      : "No server-verified fictional profiles are available. Your own signed demo evidence can still be selected.";
  } catch (error) {
    fictionalStudentProfiles = [];
    fictionalStudentCredentials = [];
    note.textContent = `Fictional demo students could not be loaded: ${error.message} Your own saved demo evidence is still available.`;
  }
}

async function studentCredentials(student) {
  const local = (await verifiedCredentials()).filter(({ payload }) => payload.student === student);
  const shared = fictionalStudentCredentials.filter(({ payload }) => payload.student === student);
  return [...local, ...shared];
}



function skillsMarkup(payload) {
  return `<div class="skills-row">${payload.mappings.map((mapping) => `<span class="skill-chip">${escapeHTML(mapping.skill)}</span>`).join("")}</div>`;
}

async function renderCredentials() {
  const verified = await verifiedCredentials();
  const studentSelect = document.querySelector("#student-lens-person");
  const selectedStudent = studentSelect.value;
  const students = [...new Set([
    ...verified.map(({ payload }) => payload.student),
    ...fictionalStudentProfiles.map(({ name }) => name),
  ])];
  studentSelect.replaceChildren();
  studentSelect.add(new Option(students.length ? "Choose a fictional student…" : "No signed demo credentials", ""));
  for (const student of students) studentSelect.add(new Option(student, student));
  if (students.includes(selectedStudent)) studentSelect.value = selectedStudent;
  else if (students.length) studentSelect.value = students[0];
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
          ({ payload, index, ...result }) =>
              `<article class="credential-full"><div class="credential-full-top"><span class="badge-symbol">${icon("award")}</span><div><h3>${escapeHTML(payload.title)}</h3><p>${escapeHTML(payload.student)} · ${escapeHTML(result.issuerName)} · ${escapeHTML(payload.issuedAt)} · Demo</p></div><span class="verified">${icon("shield-check")} SIGNATURE VALID</span></div><div class="credential-quote">“${escapeHTML(payload.transcript)}”<strong>— ${escapeHTML(payload.witness)}, community member · ${payload.example ? "fictional example" : "demo entry"}</strong></div>${skillsMarkup(payload)}<div class="credential-actions"><span class="project-meta">EVIDENCE ATTACHED · DEMO</span><button class="text-link" type="button" data-share="${index}">Share ${icon("share-2")}</button><button class="text-link" type="button" data-credential="${index}">View credential ${icon("arrow-up-right")}</button></div></article>`,
        )
        .join("")
    : '<div class="credential-full"><h3>No valid signed credentials yet.</h3><p>Create a demo vouch to get started.</p></div>';
  refreshIcons();
}

async function openCredential(index) {
  const token = credentials[index];
  if (!token || !issuer) return;
  const [result] = await refreshVerification([token]);
  if (result.status !== "verified") {
    announce(result.message || "This credential could not be verified.");
    return;
  }
  selectedCredential = token;
  const payload = result.credential;
  document.querySelector("#dialog-content").innerHTML =
    `<div class="dialog-detail"><h3>${escapeHTML(payload.title)}</h3><p><strong>Issuer:</strong> ${escapeHTML(result.issuerName)} · from the server's trusted issuer registry</p><p><strong>Witness:</strong> ${escapeHTML(payload.witness)} ${payload.example ? "(fictional example)" : "(demo entry)"}</p><p><strong>Student:</strong> ${escapeHTML(payload.student)}</p><p><strong>Credential ID:</strong> ${escapeHTML(result.credentialId)}</p><p><strong>Status:</strong> ${escapeHTML(result.message)}</p></div><div class="credential-quote">“${escapeHTML(payload.transcript)}”</div>${payload.mappings.map((mapping) => `<p><span class="skill-chip">${escapeHTML(mapping.skill)}</span> <span class="result-desc">“${escapeHTML(mapping.quote)}”</span></p>`).join("")}`;
  document.querySelector("#credential-token").value = token;
  document.querySelector("#verify-result").textContent = verifyMessage(result);
  document.querySelector("#credential-dialog").showModal();
  refreshIcons();
}

// Student pathway uses only this browser's verified credentials.
let lastLens;
let lensRender = 0;
const DISCLAIMER_STUDENT =
  "Student view uses keyword hints and signed evidence from your selected fictional demo profile, not an assessment of your ability or a hiring recommendation. Project ideas are fictional. Review the full posting, including qualifications we may miss.";

async function renderStudentPathway(input, target, renderId) {
  const student = document.querySelector("#student-lens-person").value;
  const validCredentials = await studentCredentials(student);
  if (renderId !== lensRender) return;
  const skills = buildStudentPathway(input, validCredentials);
  const supported = skills.filter((skill) => skill.evidence.length);
  const gaps = skills.filter((skill) => !skill.evidence.length);
  const evidenceCards = supported.map((skill) =>
    `<article class="pathway-card"><h4>${escapeHTML(skill.name)}</h4><p class="pathway-context">Posting mentions: “${escapeHTML(skill.context)}”</p>${skill.evidence.map((item) => `<p class="result-desc">Demo evidence · ${escapeHTML(item.skill)}: “${escapeHTML(item.quote)}”</p>${item.sharedUrl ? `<a class="text-link" href="${escapeHTML(item.sharedUrl)}" target="_blank" rel="noopener noreferrer">View signed evidence ${icon("arrow-up-right")}</a>` : `<button class="text-link" type="button" data-credential="${item.index}">View signed evidence ${icon("arrow-up-right")}</button>`}`).join("")}</article>`,
  ).join("");
  const projectMarkup = (project) => `<div class="pathway-project"><div><strong>${escapeHTML(project.title)}</strong><span>${escapeHTML(project.organization)} · ${escapeHTML(project.time)}</span><p>${escapeHTML(project.description)}</p>${demandLine(project.skills)}</div><button class="text-link" type="button" data-explore-project="${escapeHTML(project.id)}">View project ${icon("arrow-up-right")}</button></div>`;
  const gapCards = gaps.map((skill) =>
    `<article class="pathway-card"><h4>${escapeHTML(skill.name)}</h4><p class="pathway-context">Posting mentions: “${escapeHTML(skill.context)}”</p><p class="result-desc">No matching demo evidence yet. This does not mean you lack this skill.</p>${findProjectsButton(skill.name)}${skill.projects.length ? `<div class="pathway-projects"><strong>Fictional practice ideas</strong>${skill.projects.slice(0, 2).map(projectMarkup).join("")}${skill.projects.length > 2 ? `<details class="pathway-more"><summary>Show ${skill.projects.length - 2} more ${skill.projects.length === 3 ? "idea" : "ideas"}</summary>${skill.projects.slice(2).map(projectMarkup).join("")}</details>` : ""}</div>` : `<p class="result-desc">No related demo project yet. Consider another way to practise or document this skill.</p>`}</article>`,
  ).join("");
  target.className = "";
  target.innerHTML = `<div class="pathway-intro" role="status"><strong>Your skill pathway</strong><p>We found ${skills.length} skill ${skills.length === 1 ? "hint" : "hints"} in this text: ${supported.length} with related demo evidence and ${gaps.length} to explore. Keywords can miss context or requirements.</p></div>${skills.length ? `<section class="pathway-section"><h3>Evidence you have <span>${supported.length}</span></h3>${evidenceCards || '<p class="pathway-empty">No related signed demo evidence found for these skills yet.</p>'}</section><section class="pathway-section"><h3>Skills to explore <span>${gaps.length}</span></h3>${gapCards || '<p class="pathway-empty">No evidence gaps among the skills we recognized. Review the full posting for anything missed.</p>'}</section>` : `<p class="pathway-empty">No recognizable skill keywords found. Try the full job posting or review its requirements yourself.</p>`}<p class="pathway-note">Projects are fictional practice ideas, not live opportunities. Only create a demo vouch for work you want to simulate; completing a project here does not create evidence or guarantee a job.</p>`;
  refreshIcons();
  announce(`Student pathway updated: ${supported.length} skills with related evidence and ${gaps.length} to explore.`);
}

function renderLens() {
  const renderId = ++lensRender;
  document.querySelector("#student-ai-results").textContent = "";
  document.querySelector("#student-ai-results").removeAttribute("aria-busy");
  document.querySelector("#student-ai-analyze").disabled = false;
  if (!lastLens) return;
  const target = document.querySelector("#lens-results");
  document.querySelector("#lens-disclaimer-text").textContent = DISCLAIMER_STUDENT;
  renderStudentPathway(lastLens.input, target, renderId);
  refreshIcons();
}

async function analyzeJob() {
  ++lensRender;
  lastLens = undefined;
  document.querySelector("#student-ai-results").textContent = "";
  document.querySelector("#student-ai-results").removeAttribute("aria-busy");
  document.querySelector("#student-ai-analyze").disabled = false;
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
  lastLens = { input };
  renderLens();
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
    explore.select(exploreButton.dataset.exploreProject, "link");
  }
  const skillFilterButton = event.target.closest("[data-skill-filter]");
  if (skillFilterButton) {
    showView("projects");
    explore.setSkill(skillFilterButton.dataset.skillFilter);
    document.querySelector("#skill-filters .skill-filter.active")?.focus({ preventScroll: true });
  }
  const credentialButton = event.target.closest("[data-credential]");
  if (credentialButton)
    openCredential(Number(credentialButton.dataset.credential));
  const shareButton = event.target.closest("[data-share]");
  if (shareButton) {
    shareToken = credentials[Number(shareButton.dataset.share)];
    document.querySelector("#share-result").hidden = true;
    document.querySelector("#linkedin-review").hidden = true;
    document.querySelector("#linkedin-status").textContent = "";
    document.querySelector("#share-error").textContent = "";
    document.querySelector("#publish-credential").hidden = false;
    document.querySelector("#share-dialog").showModal();
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
function verifyMessage(result) {
  if (result.status === "verified") return `Verified by the server: signed by ${result.issuerName}, a trusted issuer.`;
  return `Not valid. ${result.message || "The server could not verify this credential."}`;
}
// The tamper test asks the server, the same check employers and share links get.
document.querySelector("#verify-token").addEventListener("click", async () => {
  const output = document.querySelector("#verify-result");
  output.textContent = "Checking with the server…";
  const [result] = await verifyWithServer([document.querySelector("#credential-token").value.trim()]);
  output.textContent = verifyMessage(result);
});
document.querySelector("#close-share").addEventListener("click", () => document.querySelector("#share-dialog").close());
document.querySelector("#share-dialog").addEventListener("close", () => {
  shareToken = undefined;
  linkedinCard = undefined;
  linkedinFile = undefined;
  if (linkedinPreviewUrl) URL.revokeObjectURL(linkedinPreviewUrl);
  linkedinPreviewUrl = undefined;
});
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
document.querySelector("#prepare-linkedin").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  document.querySelector("#share-error").textContent = "";
  try {
    const [result] = await refreshVerification([shareToken], { force: true });
    if (result.status !== "verified") throw new Error("This demo credential could not be verified.");
    result.payload = result.credential;
    const link = document.querySelector("#share-link").href;
    linkedinCard = await makeShareCard(result.payload, link, document.querySelector("#share-qr").src);
    linkedinFile = new File([linkedinCard], "proofly-demo-credential.png", { type: "image/png" });
    if (linkedinPreviewUrl) URL.revokeObjectURL(linkedinPreviewUrl);
    linkedinPreviewUrl = URL.createObjectURL(linkedinCard);
    document.querySelector("#linkedin-image-preview").src = linkedinPreviewUrl;
    document.querySelector("#linkedin-caption").textContent = linkedinCaption(result.payload, link);
    const data = { files: [linkedinFile], text: linkedinCaption(result.payload, link) };
    document.querySelector("#share-linkedin-image").hidden = !(navigator.share && navigator.canShare?.(data));
    document.querySelector("#linkedin-status").textContent = "";
    document.querySelector("#linkedin-review").hidden = false;
  } catch (error) {
    document.querySelector("#share-error").textContent = error.message || "Could not prepare the LinkedIn post.";
  } finally { button.disabled = false; }
});
document.querySelector("#copy-linkedin-caption").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(document.querySelector("#linkedin-caption").textContent);
    document.querySelector("#linkedin-status").textContent = "Caption copied. Paste it into your LinkedIn post.";
  } catch {
    document.querySelector("#linkedin-status").textContent = "Could not copy. Select and copy the caption above.";
  }
});
document.querySelector("#download-linkedin-image").addEventListener("click", () => {
  const download = document.createElement("a");
  download.href = linkedinPreviewUrl;
  download.download = "proofly-demo-credential.png";
  download.click();
  document.querySelector("#linkedin-status").textContent = "Image downloaded. Attach it to your LinkedIn post.";
});
document.querySelector("#share-linkedin-image").addEventListener("click", async () => {
  try {
    await navigator.share({ files: [linkedinFile], text: document.querySelector("#linkedin-caption").textContent });
    document.querySelector("#linkedin-status").textContent = "Share sheet opened. Check the image and caption in your chosen app before posting.";
  } catch (error) {
    if (error.name !== "AbortError") document.querySelector("#linkedin-status").textContent = "Could not open sharing. Download the image and copy the caption instead.";
  }
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
    const [result] = await refreshVerification([shareToken], { force: true });
    if (result.status !== "verified") throw new Error("This demo credential could not be verified.");
    const link = document.querySelector("#share-link").href;
    const blob = await makeShareCard(result.credential, link, document.querySelector("#share-qr").src);
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
  const picker = document.querySelector("#job-picker");
  const select = document.querySelector("#job-select");
  const source = document.querySelector("#job-source");
  try {
    const response = await fetch("/api/jobs");
    if (!response.ok) throw new Error("Calgary postings are unavailable.");
    const data = await response.json();
    jobPostings = Array.isArray(data.jobs) ? data.jobs : [];
    jobDemand = data.demand?.total ? data.demand : undefined;
    renderLens();
    if (jobPostings.length) {
      select.replaceChildren(new Option("Choose a Calgary posting…", ""));
      for (const [index, job] of jobPostings.entries()) {
        select.add(new Option(`${job.title} — ${job.company || "Unknown employer"}`, String(index)));
      }
      source.textContent = "Live Calgary postings via Adzuna.";
    } else {
      jobPostings = employerJobSamples;
      select.replaceChildren(new Option("Choose a fictional Calgary sample role…", ""));
      for (const [index, job] of jobPostings.entries()) {
        select.add(new Option(`Sample role (not live) — ${job.title}`, String(index)));
      }
      source.textContent = "Live Calgary postings are unavailable. These sample roles are fictional and are not active vacancies.";
    }
    picker.hidden = false;
  } catch {
    jobPostings = employerJobSamples;
    select.replaceChildren(new Option("Choose a fictional Calgary sample role…", ""));
    for (const [index, job] of jobPostings.entries()) {
      select.add(new Option(`Sample role (not live) — ${job.title}`, String(index)));
    }
    source.textContent = "Could not load live Calgary postings. These sample roles are fictional and are not active vacancies.";
    picker.hidden = false;
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
  if (job.demo) {
    source.textContent = "Fictional Calgary sample role for demonstration only; this is not a live job posting.";
  } else {
    source.innerHTML = `Live posting via Adzuna${job.snippet ? " (Adzuna shares a short excerpt; paste the full text for a fuller check)" : ""}. ${job.url ? `<a href="${escapeHTML(job.url)}" target="_blank" rel="noopener noreferrer">Open the full posting</a>` : ""}`;
  }
  analyzeJob();
});
document.querySelector("#job-description").addEventListener("input", () => {
  ++lensRender;
  lastLens = undefined;
  document.querySelector("#student-ai-results").textContent = "";
  document.querySelector("#student-ai-results").removeAttribute("aria-busy");
  document.querySelector("#student-ai-analyze").disabled = false;
  const target = document.querySelector("#lens-results");
  target.className = "lens-empty";
  target.removeAttribute("aria-busy");
  target.innerHTML = "<h2>Posting changed.</h2><p>Select Find evidence to update your results.</p>";
  document.querySelector("#analyze-job").disabled = false;
});
document.querySelector("#analyze-job").addEventListener("click", analyzeJob);
document.querySelector("#student-lens-person").addEventListener("change", renderLens);

document.querySelector("#student-ai-analyze").addEventListener("click", async () => {
  const output = document.querySelector("#student-ai-results");
  const button = document.querySelector("#student-ai-analyze");
  const posting = document.querySelector("#job-description").value.trim();
  if (!posting || posting.length > 12000) {
    output.textContent = "Enter a job posting of at most 12,000 characters first.";
    return;
  }
  const renderId = ++lensRender;
  button.disabled = true;
  output.setAttribute("aria-busy", "true");
  output.textContent = "Checking signed evidence and requesting AI-assisted ideas…";
  try {
    if (!issuer) throw new Error("Demo credential verification is unavailable. Try again when the server is ready.");
    const student = document.querySelector("#student-lens-person").value;
    const valid = await studentCredentials(student);
    if (renderId !== lensRender) return;
    const response = await fetch("/api/lens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ posting, credentials: valid.map((item) => item.token) }), // the server verifies them itself
    });
    const data = await readApiResponse(response, "AI analysis failed.");
    if (renderId !== lensRender) return;
    if (data.fallback) {
      output.textContent = "AI is unavailable. Use Find evidence for the offline keyword pathway.";
      return;
    }
    const rows = data.requirements.map((requirement) => {
      const evidence = requirement.matches.map((match) => `<p class="result-desc">“${escapeHTML(match.quote)}” — ${escapeHTML(match.witness)}${match.why ? `<br>${escapeHTML(match.why)}` : ""}</p>`).join("");
      const suggestions = requirement.suggestedProjects.map((project) => `<div class="pathway-project"><div><strong>${escapeHTML(project.title)}</strong><span>${escapeHTML(project.organization)} · ${escapeHTML(project.time)}</span><p>${escapeHTML(project.why)}</p>${demandLine(project.skills)}</div><button class="text-link" type="button" data-explore-project="${escapeHTML(project.projectId)}">View project ${icon("arrow-up-right")}</button></div>`).join("");
      return `<article class="lens-result"><h3>${escapeHTML(requirement.text)} <span class="kind-tag">${escapeHTML(requirement.kind)}</span></h3>${evidence || '<p class="result-desc">No matching evidence found. This does not mean you lack this skill.</p>'}${suggestions ? `<div class="pathway-projects"><strong>Fictional practice ideas</strong>${suggestions}</div>` : ""}</article>`;
    }).join("");
    output.innerHTML = `<div class="lens-summary"><strong>AI-assisted ideas</strong><span class="lens-source">${escapeHTML(data.model)} · ${data.stats.matched} of ${data.stats.total} requirements have suggested evidence · ${data.stats.droppedByGrounding} proposed quotes rejected. Review relevance yourself.</span></div>${rows || '<p>No requirements were identified. Review the posting yourself.</p>'}<p class="pathway-note">Suggestions are fictional practice ideas, not a measure of fit or a hiring recommendation.</p>`;
    refreshIcons();
  } catch (error) {
    if (renderId === lensRender) output.textContent = error.message || "AI analysis failed.";
  } finally {
    if (renderId === lensRender) {
      button.disabled = false;
      output.removeAttribute("aria-busy");
    }
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
  document.querySelector("#approval-student").value = payload.student;
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
    const student = document.querySelector("#approval-student").value.trim();
    if (!student || student.length > 100) {
      document.querySelector("#approval-error").textContent = "Enter a fictional student name of at most 100 characters.";
      return;
    }
    const fromKiosk = approvalSource === "kiosk";
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const token = await signDemo({ ...pendingVouch, student });
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

// Escape steps back on Explore: selected project → filtered list → every project.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || document.querySelector("#projects").hidden) return;
  if (document.querySelector("dialog[open]")) return;
  if (explore.back()) event.preventDefault();
});

const NEED_TIMES = ["1–2 HOURS", "2–3 HOURS", "3–4 HOURS", "HALF DAY", "2 HOURS / WEEK"];

// Rebuild a posted project from trusted parts: its location always comes from the public venue list,
// so stored or typed coordinates and addresses are never used. Same-venue pins are nudged apart.
function placePostedProject(item, earlier) {
  const venue = communityVenues.find((entry) => entry.id === item?.venueId);
  const title = typeof item?.title === "string" ? item.title.trim().slice(0, 80) : "";
  const description = typeof item?.description === "string" ? item.description.trim().slice(0, 300) : "";
  const skills = Array.isArray(item?.skills) ? item.skills.filter((skill) => skillNames.includes(skill)) : [];
  if (!venue || !title || !description || !skills.length || typeof item.id !== "string") return null;
  const location = atVenue(venue.id);
  const sharing = earlier.filter((project) => project.venueId === venue.id).length;
  return {
    id: item.id,
    title,
    description,
    skills,
    time: NEED_TIMES.includes(item.time) ? item.time : NEED_TIMES[0],
    icon: "sprout",
    color: "lilac",
    posted: true,
    ...location,
    lat: location.lat + sharing * 0.0007,
    lng: location.lng + sharing * 0.0011,
  };
}

async function loadPostedProjects() {
  try {
    const stored = await readState("posted-projects");
    const placed = [];
    for (const item of Array.isArray(stored) ? stored : []) {
      const project = placePostedProject(item, [...projects, ...placed]);
      const taken = [...projects, ...placed].some((existing) => existing.id === project?.id || existing.title.toLowerCase() === project?.title.toLowerCase());
      if (project && !taken) placed.push(project);
    }
    postedProjects = placed;
  } catch {
    postedProjects = [];
  }
  renderProjects();
}

function setupPostNeedForm() {
  document.querySelector("#need-venue").innerHTML =
    '<option value="">Choose a public venue</option>' +
    communityVenues
      .map((venue) => `<option value="${escapeHTML(venue.id)}">${escapeHTML(venue.name)} (${escapeHTML(venue.type)}, ${escapeHTML(venue.area)})</option>`)
      .join("");
  document.querySelector("#need-skills").innerHTML = skillNames
    .map((skill) => `<label><input type="checkbox" name="skill" value="${escapeHTML(skill)}" /> ${escapeHTML(skill)}</label>`)
    .join("");
  document.querySelector("#post-need-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = document.querySelector("#post-need-error");
    const data = new FormData(form);
    const item = {
      id: `posted-${Date.now().toString(36)}`,
      title: String(data.get("title") ?? ""),
      venueId: String(data.get("venue") ?? ""),
      description: String(data.get("description") ?? ""),
      time: String(data.get("time") ?? ""),
      skills: data.getAll("skill").map(String),
    };
    if (!item.skills.length) {
      error.textContent = "Choose at least one skill this project builds.";
      return;
    }
    if (catalog().some((project) => project.title.toLowerCase() === item.title.trim().toLowerCase())) {
      error.textContent = "A project with this title already exists. Choose a different title.";
      return;
    }
    const project = placePostedProject(item, catalog());
    if (!project) {
      error.textContent = "Add a title, a public venue, a description and at least one skill.";
      return;
    }
    const stored = postedProjects.map(({ id, title, venueId, description, time, skills }) => ({ id, title, venueId, description, time, skills }));
    let saved = false;
    if (database) {
      try {
        await writeState("posted-projects", [...stored, item]);
        saved = true;
      } catch { /* keep it for this visit only */ }
    }
    postedProjects = [...postedProjects, project];
    error.textContent = saved ? "" : "Posted for this visit only: browser storage is unavailable.";
    form.reset();
    renderProjects();
    explore.select(project.id, "post");
    explore.highlight(project.id);
    announce(`Posted example need: ${project.title}, at ${project.orgName}. ${saved ? "Saved in this browser." : "Not saved in this browser."}`);
  });
}

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

const explore = createExplore({
  getProjects: catalog,
  escapeHTML,
  announce,
  skills: skillNames,
  places: calgaryAreas, // "choose your area": a manual alternative to device location
});
renderProjects();
setupPostNeedForm();
showView(location.hash.slice(1) || "overview");
initialize();
loadJobPostings();

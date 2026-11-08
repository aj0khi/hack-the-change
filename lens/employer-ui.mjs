import { jobExample } from './job-example.mjs';
import { readApiResponse } from '../api-response.mjs';
import { employerJobSamples } from './employer-job-samples.mjs';
import { skillTerms } from './skills.mjs';

const form = document.querySelector('#employer-form');
const results = document.querySelector('#employer-results');
const button = document.querySelector('#employer-analyze');
const fields = [...form.querySelectorAll('textarea')];
const jobSelect = document.querySelector('#employer-job-select');
const jobSource = document.querySelector('#employer-job-source');
const jobField = document.querySelector('#employer-job');
const jobFile = document.querySelector('#employer-job-file');
const exampleButton = document.querySelector('#employer-example');
const studentSelect = document.querySelector('#employer-student-select');
const addStudentButton = document.querySelector('#employer-add-student');
const studentHint = document.querySelector('#employer-student-hint');
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
let jobs = [];
let demoStudents = [];

function populateJobSelect() {
  jobSelect.innerHTML = '<option value="">Choose a Calgary role…</option>';
  for (const [index, job] of jobs.entries()) {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${job.demo ? 'Sample role (not live) — ' : ''}${job.title} — ${job.company || 'Unknown employer'}`;
    jobSelect.append(option);
  }
  jobSelect.disabled = jobs.length === 0 || button.disabled;
}

function rankedStudents() {
  const requestedSkills = Object.entries(skillTerms)
    .filter(([, pattern]) => pattern.test(jobField.value))
    .map(([skill]) => skill);
  return demoStudents.map((student, index) => ({
    ...student,
    originalIndex: index,
    matchedSkills: student.skills.filter(skill => requestedSkills.includes(skill)),
  })).sort((a, b) => b.matchedSkills.length - a.matchedSkills.length || a.name.localeCompare(b.name));
}

function updateStudentPicker() {
  const previous = studentSelect.value;
  const ranked = rankedStudents();
  studentSelect.replaceChildren(new Option(ranked.length ? 'Choose a fictional demo student…' : 'Demo students unavailable', ''));
  for (const [index, student] of ranked.entries()) {
    const option = new Option(
      `${index + 1}. ${student.name} · ${student.matchedSkills.length} match${student.matchedSkills.length === 1 ? '' : 'es'}`,
      String(student.originalIndex),
    );
    studentSelect.add(option);
  }
  studentSelect.value = previous;
  studentSelect.disabled = ranked.length === 0 || button.disabled;
  addStudentButton.disabled = !studentSelect.value || button.disabled;
  if (!jobField.value.trim()) studentHint.textContent = 'Choose or add a job description to rank demo profiles. Demo-only keyword overlap—not a skill, ability, or hiring score. Real students are not listed; add only links shared with you.';
  else if (!ranked.some(student => student.matchedSkills.length)) studentHint.textContent = 'No recognized demo-skill keywords in this posting; fictional students are listed alphabetically. This is not a hiring score. Real students are not listed; add only links shared with you.';
  else studentHint.textContent = 'Fictional demo students are ordered by the number of listed sample skills whose keywords appear in this posting. This is not an ability, suitability, or hiring score. Real students are not listed; add only links shared with you.';
}

async function loadDemoStudents() {
  try {
    const response = await fetch('/api/employer/demo-students');
    const data = await readApiResponse(response, 'Demo students could not be loaded.');
    demoStudents = Array.isArray(data.students) ? data.students : [];
    updateStudentPicker();
  } catch (error) {
    studentSelect.replaceChildren(new Option('Demo students unavailable', ''));
    studentSelect.disabled = true;
    addStudentButton.disabled = true;
    studentHint.textContent = error.message || 'Could not load fictional demo students. You can still add shared verification links below.';
  }
}

async function loadJobs() {
  try {
    const response = await fetch('/api/jobs');
    if (!response.ok) throw new Error('Job postings could not be loaded.');
    const data = await response.json();
    jobs = Array.isArray(data.jobs) ? data.jobs : [];
    if (jobs.length) {
      populateJobSelect();
      jobSource.textContent = 'Select a Calgary posting, paste your own, or use the fictional example.';
    } else {
      jobs = employerJobSamples;
      populateJobSelect();
      jobSource.textContent = 'Live Calgary postings are unavailable. These clearly labelled sample roles are fictional and are not active vacancies.';
    }
  } catch {
    jobs = employerJobSamples;
    populateJobSelect();
    jobSource.textContent = 'Could not load live Calgary postings. These clearly labelled sample roles are fictional and are not active vacancies.';
  }
}

function inputsChanged() {
  updateStudentPicker();
  document.querySelector('#employer-results-count').hidden = true;
  results.innerHTML = '<div class="employer-empty-state employer-ready-state"><span class="employer-empty-icon" aria-hidden="true">↗</span><h3>Ready to compare</h3><p>Review the job and add students, then compare their shared evidence against the role.</p></div>';
}

jobFile.addEventListener('change', async () => {
  const file = jobFile.files[0];
  if (!file) return;
  if (!/\.(txt|md)$/i.test(file.name)) {
    jobSource.textContent = 'Upload a plain-text .txt or .md file.';
    jobFile.value = '';
    return;
  }
  if (file.size > 48_000) {
    jobSource.textContent = 'The uploaded file is too large. Keep it under 12,000 characters.';
    jobFile.value = '';
    return;
  }
  try {
    const posting = await file.text();
    if (!posting.trim() || posting.length > 12_000) {
      jobSource.textContent = 'The file must contain a job description of 1–12,000 characters.';
      jobFile.value = '';
      return;
    }
    jobField.value = posting;
    jobSelect.value = '';
    jobSource.textContent = `Loaded ${file.name}. Review the posting before comparing students.`;
    inputsChanged();
  } catch {
    jobSource.textContent = 'Could not read the file. Try a plain-text .txt or .md file.';
  }
  jobFile.value = '';
});

jobSelect.addEventListener('change', () => {
  const job = jobSelect.value === '' ? null : jobs[Number(jobSelect.value)];
  if (!job) return;
  jobField.value = `${job.title} — ${job.company}, ${job.location}\n\n${job.description}`;
  jobFile.value = '';
  jobSource.textContent = job.demo
    ? 'Fictional Calgary sample role for demonstration only; this is not a live job posting.'
    : `Adzuna posting${job.snippet ? ' (short excerpt; paste the full posting for a fuller check)' : ''}.`;
  try {
    const url = new URL(job.url);
    if (!job.demo && (url.protocol === 'https:' || url.protocol === 'http:')) {
      const link = document.createElement('a');
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = ' Open the full posting';
      jobSource.append(link);
    }
  } catch { /* The posting can still be analyzed without an external link. */ }
  inputsChanged();
});
exampleButton.addEventListener('click', () => {
  jobField.value = jobExample;
  jobFile.value = '';
  jobSelect.value = '';
  jobSource.textContent = 'Fictional example job.';
  inputsChanged();
});
studentSelect.addEventListener('change', () => {
  addStudentButton.disabled = !studentSelect.value || button.disabled;
});
addStudentButton.addEventListener('click', () => {
  const student = demoStudents[Number(studentSelect.value)];
  if (!student || !student.links.length) {
    studentHint.textContent = 'This fictional demo profile has no published verification links.';
    return;
  }
  const textarea = document.querySelector('#employer-links');
  const groups = textarea.value.trim()
    ? textarea.value.trim().split(/\r?\n\s*\r?\n/).map(group => group.split(/\r?\n/).map(line => line.trim()).filter(Boolean)).filter(group => group.length)
    : [];
  if (groups.length >= 10) {
    studentHint.textContent = 'The comparison already has 10 student groups. Remove one before adding another.';
    return;
  }
  const existing = new Set(groups.flat());
  const links = student.links.filter(link => !existing.has(link));
  if (!links.length) {
    studentHint.textContent = `${student.name} is already in the comparison.`;
    return;
  }
  if (links.length > 10) {
    studentHint.textContent = 'This student has too many demo credentials to add as one group.';
    return;
  }
  groups.push(links);
  textarea.value = groups.map(group => group.join('\n')).join('\n\n');
  inputsChanged();
  studentHint.textContent = `Added fictional demo student ${student.name}. Review their links and the job before comparing.`;
});
loadJobs();
loadDemoStudents();

form.addEventListener('submit', async event => {
  event.preventDefault();
  const posting = jobField.value.trim();
  const groups = document.querySelector('#employer-links').value.trim().split(/\r?\n\s*\r?\n/).map(group => group.split(/\r?\n/).map(line => line.trim()).filter(Boolean)).filter(group => group.length);
  if (!groups.length) {
    results.textContent = 'Provide at least one shared verification link.';
    return;
  }
  if (groups.length > 10 || groups.some(group => group.length > 10)) {
    results.textContent = 'Use at most 10 student groups, with at most 10 links per group.';
    return;
  }
  button.disabled = true;
  fields.forEach(field => { field.disabled = true; });
  jobFile.disabled = true;
  jobSelect.disabled = true;
  exampleButton.disabled = true;
  studentSelect.disabled = true;
  addStudentButton.disabled = true;
  results.textContent = 'Verifying shared credentials and comparing evidence…';
  results.setAttribute('aria-busy', 'true');
  try {
    const outcomes = [];
    for (const links of groups) {
      try {
        const response = await fetch('/api/employer/lens', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ posting, links }),
        });
        const data = await readApiResponse(response, 'Analysis failed.');
        outcomes.push({ data });
      } catch (error) {
        outcomes.push({ error: error.message || 'Analysis failed.' });
      }
    }
    const successful = outcomes.filter(outcome => outcome.data);
    const count = document.querySelector('#employer-results-count');
    count.textContent = `${successful.length} ${successful.length === 1 ? 'student' : 'students'}`;
    count.hidden = !successful.length;
    results.innerHTML = '<p class="employer-review-note">Review each student’s evidence and the full posting yourself. Keyword counts are not fit scores or hiring recommendations.</p>' + outcomes.map(({ data, error }, groupIndex) => {
    if (error) return `<section class="employer-candidate employer-candidate-error"><h3>Student group ${groupIndex + 1}</h3><p>${escape(error)}</p></section>`;
    const sources = data.sources.map((source, i) => `<li><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">Credential ${i + 1}: ${escape(source.title)}</a> — ${escape(source.student)}, ${escape(source.issuer)}; witness ${escape(source.witness)}. Signature valid.</li>`).join('');
    const rows = data.requirements.map(requirement => {
      const matches = requirement.matches.map(match => {
        const source = data.sources[Number(match.credentialId)];
        if (!source) return '';
        return `<p class="result-desc">${match.evidenceType ? `<span class="evidence-tag ${match.evidenceType === 'action' ? 'action' : 'praise'}">${escape(match.evidenceType)}</span>` : ''}“${escape(match.quote)}” — ${escape(source.witness)}, ${escape(source.student)} · <a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">View credential</a>${match.why ? `<br>${escape(match.why)}` : ''}${match.skill ? `<br>Keyword hint: ${escape(match.skill)}` : ''}</p>`;
      }).join('');
      return `<article class="lens-result"><h3>${escape(requirement.text)}${requirement.kind ? ` <span class="kind-tag">${escape(requirement.kind)}</span>` : ''}</h3>${requirement.context ? `<p class="employer-posting-context">Posting context: “${escape(requirement.context)}”</p>` : ''}${matches || '<p class="result-desc">No matching evidence found. This does not mean the person lacks the skill.</p>'}</article>`;
    }).join('');
    const matched = data.requirements.filter(requirement => requirement.matches.length).length;
    const matchLabel = data.mode === 'offline' ? 'skill keywords with evidence' : 'requirements with evidence';
    return `<section class="employer-candidate"><div class="employer-candidate-heading"><div><span class="employer-candidate-label">SHARED DEMO PROFILE</span><h3>${escape(data.sources[0].student)}</h3></div><span class="employer-match-count">${matched} / ${data.requirements.length}<small>${matchLabel}</small></span></div><div class="lens-summary${data.mode === 'offline' ? ' offline' : ''}"><strong>${data.mode === 'ai' ? 'AI-assisted comparison' : 'Keyword comparison'}</strong><span class="lens-source">${data.mode === 'ai' ? `${escape(data.model)} · ${Number(data.stats.droppedByGrounding)} unsupported quote${Number(data.stats.droppedByGrounding) === 1 ? '' : 's'} rejected by grounding checks.` : 'Approximate keyword matches only; they do not establish that a requirement is met.'}</span></div><details class="employer-source-details"><summary>${data.sources.length} signed demo source${data.sources.length === 1 ? '' : 's'}</summary><ul>${sources}</ul><p>Names do not establish identity. Confirm ownership independently.</p></details><div class="employer-requirements">${rows || '<p>No requirements were identified. Review the full job posting manually.</p>'}</div></section>`;
    }).join('');
  } catch (error) {
    results.textContent = error.message || 'Could not analyze the shared credentials.';
  } finally {
    button.disabled = false;
    fields.forEach(field => { field.disabled = false; });
    jobFile.disabled = false;
    jobSelect.disabled = jobs.length === 0;
    exampleButton.disabled = false;
    updateStudentPicker();
    results.removeAttribute('aria-busy');
  }
});
fields.forEach(field => field.addEventListener('input', inputsChanged));

document.querySelector('#badge-lookup-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const output = document.querySelector('#badge-lookup-result');
  const button = form.querySelector('button[type="submit"]');
  output.hidden = false;
  output.textContent = 'Checking the provider’s public record…';
  button.disabled = true;
  try {
    const response = await fetch('/api/badgr/assertion', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const result = await readApiResponse(response, 'Badge lookup unavailable.');
    const messages = {
      found: 'Provider record found. Recipient ownership and issuer trust are not verified.',
      revoked: 'The provider reports that this assertion is revoked.',
      expired: 'This assertion has expired.',
      not_found: 'No public assertion was found in this region.',
    };
    output.textContent = messages[result.status] || 'The badge status could not be determined.';
    if (result.status === 'found' && result.badgeName) output.textContent += ` Badge: ${result.badgeName}.`;
  } catch (error) {
    output.textContent = error.message || 'Badge lookup unavailable.';
  } finally { button.disabled = false; }
});

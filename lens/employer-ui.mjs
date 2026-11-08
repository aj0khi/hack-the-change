const form = document.querySelector('#employer-form');
const results = document.querySelector('#employer-results');
const button = document.querySelector('#employer-analyze');
const fields = [...form.querySelectorAll('textarea')];
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

form.addEventListener('submit', async event => {
  event.preventDefault();
  const posting = document.querySelector('#employer-job').value.trim();
  const links = document.querySelector('#employer-links').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  button.disabled = true;
  fields.forEach(field => { field.disabled = true; });
  results.textContent = 'Verifying shared credentials and comparing evidence…';
  results.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('/api/employer/lens', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ posting, links }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Analysis failed.');
    const sources = data.sources.map((source, i) => `<li><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">Credential ${i + 1}: ${escape(source.title)}</a> — ${escape(source.student)}, ${escape(source.issuer)}; witness ${escape(source.witness)}. Signature valid.</li>`).join('');
    const rows = data.requirements.map(requirement => {
      const matches = requirement.matches.map(match => {
        const source = data.sources[Number(match.credentialId)];
        if (!source) return '';
        return `<p class="result-desc">“${escape(match.quote)}” — ${escape(source.witness)}, ${escape(source.student)} · <a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">View credential</a>${match.why ? `<br>${escape(match.why)}` : ''}${match.skill ? `<br>Keyword hint: ${escape(match.skill)}` : ''}</p>`;
      }).join('');
      return `<article class="lens-result"><h3>${escape(requirement.text)}</h3>${matches || '<p class="result-desc">No matching evidence found. This does not mean the person lacks the skill.</p>'}</article>`;
    }).join('');
    results.innerHTML = `<div class="lens-summary${data.mode === 'offline' ? ' offline' : ''}"><strong>${data.mode === 'ai' ? 'AI-assisted analysis' : 'Offline keyword hints'}</strong><span class="lens-source">${data.mode === 'ai' ? `Quotes are checked against signed evidence; ${Number(data.stats.droppedByGrounding)} proposed matches were rejected. Review relevance yourself.` : 'AI unavailable: keyword matches are approximate and do not establish that a requirement is met.'}</span></div><h3>Verified demo sources</h3><ul>${sources}</ul><p class="share-hint">Matching names do not prove these credentials belong to the same person. Confirm ownership independently.</p>${rows || '<p>No requirements were identified. Review the full job posting manually.</p>'}<p class="share-hint">This is not a hiring recommendation. A signature does not verify the issuer, witness, or claims.</p>`;
  } catch (error) {
    results.textContent = error.message || 'Could not analyze the shared credentials.';
  } finally {
    button.disabled = false;
    fields.forEach(field => { field.disabled = false; });
    results.removeAttribute('aria-busy');
  }
});
fields.forEach(field => field.addEventListener('input', () => {
  results.textContent = 'Inputs changed. Analyze again to update the results.';
}));

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
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Badge lookup unavailable.');
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

const resources = [
  { id: 'library-events', category: 'meet', tag: 'Meet people', icon: 'users-round', color: 'peach', title: 'Find your kind of gathering', description: 'Explore library events where you can meet neighbours and try something new.', provider: 'Calgary Public Library', url: 'https://www.calgarylibrary.ca/events-and-programs/events' },
  { id: 'library-programs', category: 'learn', tag: 'Learn together', icon: 'book-open', color: 'yellow', title: 'Learn something new', description: 'Discover library programs for different ages and interests across the city.', provider: 'Calgary Public Library', url: 'https://www.calgarylibrary.ca/events-and-programs/programs' },
  { id: 'city-support', category: 'support', tag: 'Find support', icon: 'heart-handshake', color: 'blue', title: 'Find a little support', description: 'Explore local mental health and addiction support resources from the City.', provider: 'City of Calgary', url: 'https://www.calgary.ca/social-services/mental-health/resources.html' },
  { id: 'seniors-social', category: 'meet', tag: 'Meet people', icon: 'coffee', color: 'yellow', title: 'Make room for a conversation', description: 'Find a Seniors Drop-In Social Club for people 55 and older at participating libraries.', provider: 'Calgary Public Library', url: 'https://www.calgarylibrary.ca/events-and-programs/programs?query=Seniors+Drop-In+Social+Club' },
  { id: 'newcomer-programs', category: 'learn', tag: 'Learn together', icon: 'messages-square', color: 'blue', title: 'Find your footing in Calgary', description: 'Explore library programs for newcomers and English language learners.', provider: 'Calgary Public Library', url: 'https://calgarylibrary.ca/events-and-programs/programs/?Audience%5B%5D=newcomer-and-ell#events-programs-filters' },
  { id: 'library-locations', category: 'meet', tag: 'Meet people', icon: 'map-pin', color: 'peach', title: 'Start close to home', description: 'Find a Calgary library near you and see its hours and services.', provider: 'Calgary Public Library', url: 'https://www.calgarylibrary.ca/your-library/locations' }
];

const storageKey = 'good-neighbour-plan-v1';
let plan = {};
try {
  const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) plan = stored;
} catch { plan = {}; }
let activeFilter = 'all';
const resourceList = document.querySelector('#resource-list');
const planList = document.querySelector('#plan-list');
const announcement = document.querySelector('#announcement');

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify(plan)); return true; }
  catch { announcement.textContent = 'Your plan could not be saved on this device. It will only last for this visit.'; return false; }
}

function renderResources() {
  const visible = resources.filter(resource => activeFilter === 'all' || resource.category === activeFilter);
  document.querySelector('#results-count').textContent = `${visible.length} ${visible.length === 1 ? 'IDEA' : 'IDEAS'} TO EXPLORE`;
  resourceList.innerHTML = visible.map(resource => {
    const saved = Object.hasOwn(plan, resource.id);
    return `<article class="resource-card"><div class="card-top"><span class="card-icon ${resource.color}"><i data-lucide="${resource.icon}" aria-hidden="true"></i></span><span class="card-tag">${resource.tag}</span></div><h3>${resource.title}</h3><p>${resource.description}</p><div class="card-footer"><span class="provider">${resource.provider}</span><div class="card-actions"><button class="save-button ${saved ? 'saved' : ''}" type="button" data-save="${resource.id}" aria-pressed="${saved}" aria-label="${saved ? 'Saved' : 'Save'} ${resource.title}"><i data-lucide="${saved ? 'check' : 'bookmark'}" aria-hidden="true"></i>${saved ? 'Saved' : 'Save'}</button><a class="visit-link" href="${resource.url}" target="_blank" rel="noopener noreferrer" aria-label="Visit ${resource.title} on ${resource.provider} (opens in a new tab)" title="Visit provider"><i data-lucide="arrow-up-right" aria-hidden="true"></i></a></div></div></article>`;
  }).join('');
  refreshIcons();
}

function renderPlan() {
  const savedResources = resources.filter(resource => Object.hasOwn(plan, resource.id));
  document.querySelectorAll('[data-saved-count]').forEach(element => { element.textContent = savedResources.length; });
  if (!savedResources.length) {
    planList.innerHTML = '<div class="empty-plan"><span class="empty-plan-icon"><i data-lucide="bookmark" aria-hidden="true"></i></span><div><strong>A little space for your next step.</strong><p>Save an idea above and it will be waiting here for you.</p></div></div>';
  } else {
    planList.innerHTML = savedResources.map(resource => `<div class="plan-item ${plan[resource.id] ? 'done' : ''}"><input type="checkbox" id="plan-${resource.id}" data-complete="${resource.id}" ${plan[resource.id] ? 'checked' : ''}><label for="plan-${resource.id}">${resource.title}</label><a class="visit-link" href="${resource.url}" target="_blank" rel="noopener noreferrer" aria-label="Visit ${resource.title} (opens in a new tab)" title="Visit provider"><i data-lucide="arrow-up-right" aria-hidden="true"></i></a><button type="button" class="remove-button" data-remove="${resource.id}" aria-label="Remove ${resource.title} from your plan">Remove</button></div>`).join('');
  }
  refreshIcons();
}

document.querySelector('.filters').addEventListener('click', event => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  activeFilter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(filter => {
    const active = filter === button;
    filter.classList.toggle('active', active);
    filter.setAttribute('aria-pressed', String(active));
  });
  renderResources();
});

resourceList.addEventListener('click', event => {
  const button = event.target.closest('[data-save]');
  if (!button) return;
  const resource = resources.find(item => item.id === button.dataset.save);
  if (Object.hasOwn(plan, resource.id)) delete plan[resource.id];
  else plan[resource.id] = false;
  const saved = Object.hasOwn(plan, resource.id);
  if (persist()) announcement.textContent = `${resource.title} ${saved ? 'added to' : 'removed from'} your plan.`;
  renderResources();
  renderPlan();
  resourceList.querySelector(`[data-save="${resource.id}"]`)?.focus();
});

planList.addEventListener('change', event => {
  const checkbox = event.target.closest('[data-complete]');
  if (!checkbox) return;
  plan[checkbox.dataset.complete] = checkbox.checked;
  persist();
  checkbox.closest('.plan-item').classList.toggle('done', checkbox.checked);
});

planList.addEventListener('click', event => {
  const button = event.target.closest('[data-remove]');
  if (!button) return;
  const resource = resources.find(item => item.id === button.dataset.remove);
  delete plan[resource.id];
  if (persist()) announcement.textContent = `${resource.title} removed from your plan.`;
  renderResources();
  renderPlan();
  document.querySelector('#plan-title').setAttribute('tabindex', '-1');
  document.querySelector('#plan-title').focus();
});

renderResources();
renderPlan();
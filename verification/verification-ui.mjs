import { displayNameFromEmail } from './account-name.mjs';
import { readApiResponse } from '../api-response.mjs';

const accountStatus = document.querySelector('#verification-account');
const identityStatus = document.querySelector('#verification-identity');
const organizationStatus = document.querySelector('#verification-organization');
const login = document.querySelector('#account-login');
const logout = document.querySelector('#account-logout');
const startIdentity = document.querySelector('#identity-start');
const refreshIdentity = document.querySelector('#identity-refresh');
const organizationForm = document.querySelector('#organization-form');
const organizationSubmit = document.querySelector('#organization-submit');
let client;
let config;

function showAccountName(email) {
  const name = displayNameFromEmail(email);
  if (!name) return;
  document.querySelector('#profile-name').textContent = name;
  document.querySelector('#profile-description').textContent = 'Account display name · demo workspace';
  document.querySelector('#overview-name').textContent = name;
  document.querySelectorAll('[data-profile-initial]').forEach(element => {
    element.textContent = Array.from(name)[0].toLocaleUpperCase();
  });
}

async function request(path, options = {}) {
  const token = await client.getTokenSilently({ authorizationParams: { audience: config.auth0Audience, scope: 'access:verification' } });
  const response = await fetch(path, { ...options, headers: { authorization: `Bearer ${token}`, ...(options.body ? { 'content-type': 'application/json' } : {}) }, cache: 'no-store' });
  return readApiResponse(response, 'Unable to complete the request.');
}

function renderStatus(data) {
  accountStatus.textContent = `Email verified: ${data.email}`;
  showAccountName(data.email);
  const labels = {
    not_started: 'Identity check not started.',
    pending: 'Identity verification is pending. Refresh once Stripe has completed your check.',
    needs_input: 'Stripe needs more information. Continue the identity check or start a new session if your link expired.',
    verified: 'Government ID verification completed. Duplicate identity review is still required.',
    test_verified: 'Stripe test-mode check completed. This is not a real identity verification.',
  };
  identityStatus.textContent = labels[data.identityStatus] || 'Identity verification is not complete.';
  startIdentity.disabled = !config.identityEnabled || data.identityStatus === 'verified';
  refreshIdentity.disabled = !config.identityEnabled || data.identityStatus === 'not_started';
  organizationSubmit.disabled = false;
  organizationStatus.textContent = data.organization
    ? `${data.organization.name}: ${data.organization.status}. Registry: ${data.organization.registryStatus}; official contact: ${data.organization.contactStatus}; staff affiliation: ${data.organization.membershipStatus}.`
    : 'No organization review requested.';
}

async function loadAccount() {
  try { renderStatus(await request('/api/account')); }
  catch (error) {
    accountStatus.textContent = error.message;
    startIdentity.disabled = true;
    refreshIdentity.disabled = true;
    organizationSubmit.disabled = true;
  }
}

async function initialize() {
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    config = await readApiResponse(response, 'Verification service is unavailable.');
    if (!config.enabled) throw new Error('Account verification is not configured. Configure Auth0 to enable sign-in.');
    if (!window.auth0?.createAuth0Client) throw new Error('The account sign-in library could not be loaded.');
    client = await window.auth0.createAuth0Client({
      domain: config.auth0Domain,
      clientId: config.auth0ClientId,
      authorizationParams: { audience: config.auth0Audience, redirect_uri: `${location.origin}/`, scope: 'openid profile email access:verification' },
      cacheLocation: 'memory',
    });
    const parameters = new URLSearchParams(location.search);
    if (parameters.has('code') && parameters.has('state')) {
      await client.handleRedirectCallback();
      history.replaceState(null, '', '/#verification');
    }
    if (await client.isAuthenticated()) {
      logout.hidden = false;
      try {
        const user = await client.getUser();
        showAccountName(user?.email);
      } catch (error) {
        console.warn('Could not read the account profile:', error.message);
      }
      await loadAccount();
    } else {
      login.hidden = false;
      accountStatus.textContent = 'Sign in and verify your email to continue.';
    }
  } catch (error) { accountStatus.textContent = error.message || 'Account verification is unavailable.'; }
}

login.addEventListener('click', async () => {
  try { await client.loginWithRedirect(); }
  catch { accountStatus.textContent = 'Could not open sign-in. Please try again.'; }
});
logout.addEventListener('click', async () => {
  try { await client.logout({ logoutParams: { returnTo: `${location.origin}/` } }); }
  catch { accountStatus.textContent = 'Could not sign out. Please try again.'; }
});
startIdentity.addEventListener('click', async () => {
  try {
    startIdentity.disabled = true;
    const result = await request('/api/account/identity', { method: 'POST', body: '{}' });
    const url = new URL(result.url);
    if (url.protocol !== 'https:' || url.hostname !== 'verify.stripe.com') throw new Error('The identity provider returned an unexpected address.');
    location.assign(url.href);
  } catch (error) { identityStatus.textContent = error.message; startIdentity.disabled = false; }
});
refreshIdentity.addEventListener('click', async () => {
  try { renderStatus(await request('/api/account/identity/refresh', { method: 'POST', body: '{}' })); }
  catch (error) { identityStatus.textContent = error.message; }
});
organizationForm.addEventListener('submit', async event => {
  event.preventDefault();
  organizationSubmit.disabled = true;
  try {
    const values = Object.fromEntries(new FormData(organizationForm));
    const data = await request('/api/account/organization', { method: 'POST', body: JSON.stringify(values) });
    organizationForm.reset();
    renderStatus(data);
  } catch (error) { organizationStatus.textContent = error.message; organizationSubmit.disabled = false; }
});

initialize();
const storageKey = 'proofly-demo-entry-completed';
const isVerificationReturn = location.pathname === '/' &&
  (location.hash === '#verification' || (new URLSearchParams(location.search).has('code') && new URLSearchParams(location.search).has('state')));

let completed = false;
try {
  completed = sessionStorage.getItem(storageKey) === 'yes';
} catch {
  // The flow still works for the current page if browser storage is unavailable.
}

if (!completed && !isVerificationReturn) {
  const dialog = document.createElement('dialog');
  dialog.className = 'demo-entry';
  dialog.setAttribute('aria-labelledby', 'demo-entry-title');
  dialog.setAttribute('aria-describedby', 'demo-entry-description');
  dialog.innerHTML = `
    <div class="demo-entry-content">
      <div class="demo-entry-eyebrow">PROOFLY · DEMONSTRATION</div>
      <h1 id="demo-entry-title">Welcome to Proofly.</h1>
      <p id="demo-entry-description">See how sign-in and Stripe identity verification would work before entering the workspace.</p>
      <div class="demo-entry-notice"><strong>Simulation only.</strong> This does not sign you in, contact Stripe, verify your identity, or protect access to the app. No personal information is collected.</div>
      <ol class="demo-entry-steps">
        <li id="demo-entry-account"><span>01</span><div><strong>Sign in</strong><small>Simulate an account sign-in</small></div><b>Current</b></li>
        <li id="demo-entry-identity"><span>02</span><div><strong>Stripe Identity</strong><small>Simulate the identity check</small></div><b>Next</b></li>
      </ol>
      <p class="demo-entry-status" role="status" aria-live="polite"></p>
      <button class="button primary demo-entry-action" type="button">Simulate sign-in</button>
      <a class="demo-entry-link" href="/#verification">Use configured Auth0 and Stripe verification instead →</a>
      <p class="demo-entry-footnote">The real provider flow requires configured accounts and is separate from this simulation.</p>
    </div>`;
  document.body.append(dialog);
  const button = dialog.querySelector('.demo-entry-action');
  const status = dialog.querySelector('.demo-entry-status');
  const account = dialog.querySelector('#demo-entry-account');
  const identity = dialog.querySelector('#demo-entry-identity');
  const providerLink = dialog.querySelector('.demo-entry-link');
  let step = 'account';

  dialog.addEventListener('cancel', event => event.preventDefault());
  providerLink.addEventListener('click', event => {
    const verificationNav = document.querySelector('.nav-link[data-view="verification"]');
    if (verificationNav) {
      event.preventDefault();
      dialog.close();
      verificationNav.click();
    }
  });
  button.addEventListener('click', () => {
    if (step === 'account') {
      step = 'identity';
      account.querySelector('b').textContent = 'Simulated';
      identity.querySelector('b').textContent = 'Current';
      status.textContent = 'Demo sign-in simulated. No account was authenticated.';
      button.textContent = 'Simulate Stripe check';
    } else if (step === 'identity') {
      step = 'ready';
      identity.querySelector('b').textContent = 'Simulated';
      status.textContent = 'Stripe check simulated. No identity was verified.';
      button.textContent = 'Enter workspace';
    } else {
      try {
        sessionStorage.setItem(storageKey, 'yes');
      } catch {
        console.warn('Demo entry: browser storage unavailable; the walkthrough will appear again on the next page.');
      }
      dialog.close();
    }
  });
  dialog.showModal();
}

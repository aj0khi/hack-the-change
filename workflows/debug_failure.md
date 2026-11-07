# Workflow: Something is broken

**Objective:** Find the cause before changing code.

**Steps**
1. Reproduce it. Capture the exact error text or the failing check from `bash tools/check.sh`.
2. State one hypothesis and the evidence for it.
3. Test the hypothesis with the smallest possible check (a log line, a single test, `tools/verify_token.mjs`).
4. Fix only the cause. Re-run the gate.
5. If two attempts fail, stop and report what you tried and what you saw. Don't keep guessing.

**Common causes here**
- Signing unavailable: page not on `localhost` or HTTPS, or the browser lacks Ed25519 Web Crypto.
- Old credentials invalid: browser site data was cleared, so the issuer key changed.
- iOS rejects a web token: key not in SPKI form, or base64url padding mishandled.

# Agent Instructions — Vouch YYC

You are working on Vouch YYC, a Hack the Change 2026 project (Prompt 2): community members vouch for students, a partner organization signs the vouch, and employers check it against their job posting.

This repo uses a **layered architecture**. AI does the reasoning; deterministic code does anything that must be exactly right every time. Keep those apart. If a result must be correct, a script or test decides it, not your judgment.

## The layers

**Layer 0: Contracts (fixed rules)**
- The things below are not up for interpretation. Change them only through `workflows/change_trust_format.md`, with the human's approval.
- See "Contracts" at the bottom of this file.

**Layer 1: Workflows (the instructions)**
- Plain-language SOPs in `workflows/`. Each states the objective, inputs, steps, and edge cases.
- Before any task, check whether a workflow covers it and follow it.
  - `add_feature.md`: any feature or UI change
  - `change_trust_format.md`: anything touching signing, tokens, keys, or QR formats
  - `debug_failure.md`: something is broken
  - `prepare_submission.md`: Devpost and README before the deadline
- If no workflow fits, do the task, then propose a new workflow file so the next run is repeatable.

**Layer 2: Agent (you, the decision-maker)**
- Read the workflow, decide the order of work, run the tools, interpret results, and ask when something is genuinely unclear.
- You connect intent to execution. You do not replace the tools. Example: to check whether a token is valid, run `node tools/verify_token.mjs <key> <token>`. Never decide by reading the token yourself.
- Ask before: changing a contract, deleting files, adding a dependency, or anything visible in the demo that the team didn't ask for.

**Layer 3: Tools (the execution)**
- Deterministic scripts in `tools/` and the core modules. Same input, same output.
  - `trust.mjs`: signing, verification, grounding check (core module; web app imports it)
  - `tools/verify_token.mjs`: verify a token against a key; exit 0 valid, 1 invalid
  - `tools/make_test_vector.mjs`: sign a known credential for cross-platform tests
  - `tools/check.sh`: the gate (below)
- Prefer adding a small script to `tools/` over repeating a multi-step manual process.

**Layer 4: Verification (the gate)**
- Nothing is "done" until `bash tools/check.sh` passes. It runs the test suite, a sign/verify/tamper round trip, syntax checks, a check that `.env` isn't committed, and a secret scan.
- Report the check result in your final message. If something can't be checked here (iOS tests, the live demo in a browser), say so explicitly instead of implying it works.

## How the layers fail safely

- AI output is a **proposal**. Code checks it before it matters. Example: a skill mapping is kept only if its quote appears verbatim in the transcript (`groundedMappings`).
- When a tool fails, read the error, fix the cause, re-run, and record what you learned in the relevant workflow's edge cases.
- Two failed attempts at the same fix: stop and report rather than keep guessing.

## Project map

| Path | What it is |
| --- | --- |
| `index.html`, `app.js`, `styles.css` | Web app: dashboard, projects, vouch form, credentials, Employer Lens, account verification |
| `trust.mjs` | Signing, verification, grounding check (shared contract with iOS) |
| `server.mjs` | Express server: static files, Badgr lookup, Auth0 + Stripe Identity account checks |
| `badgr.mjs`, `verification-*.mjs` | Badge lookup and account-verification policy/store/UI |
| `*.test.mjs` | Node tests (`npm test`) |
| `mobile/Vouch/` | iOS app (SwiftUI, Xcode). `Vouch/VouchTrust.swift` mirrors `trust.mjs` |
| `workflows/` | SOPs (Layer 1) |
| `tools/` | Deterministic scripts (Layer 3/4) |

Run the web app: `npm install`, then `npm start`, then open `http://localhost:8766/`. Secrets live in `.env` (copied from `.env.example`), never in git.
Run the iOS app: open `mobile/Vouch/Vouch.xcodeproj` in Xcode, pick an iPhone simulator, press Cmd-R. Cmd-U runs the iOS tests.

**Team coordination:** before editing shared files, read the "Team Coordination" section of `README.md`, and update your own teammate section when you start, change or hand off work. Each person works on their own branch; only merge to `main` when the team agrees.

## Contracts

- **Token:** compact JWS, `base64url(header).base64url(payload).base64url(signature)`. Header is exactly `{"alg":"EdDSA","typ":"JWT"}`. Signature is Ed25519 over `header.payload`.
- **Public key:** base64url of the SPKI encoding (Web Crypto `exportKey("spki")`).
- **Payload fields:** `title, witness, transcript, issuer, student, example, issuedAt, mappings[{skill, quote}]`.
- **Grounding:** every mapping needs a non-empty skill and a quote found verbatim in `transcript`. Signing refuses otherwise; verification fails otherwise.
- **QR strings:** `vouch:1:<token>` for a credential; `vouchkey:1:<issuer name>|<publicKeySPKI>` for an issuer.
- **Skills:** Canada's nine Skills for Success labels, spelled as in the vouch form.
- **Data:** all people, organizations, and jobs are fictional and labelled as such. No real personal data, no surnames for community members.

## Git rules

- Work on your own branch. Never commit to or push to `main` directly, and never force push.
- Run `git status` before every commit and stage only the files you meant to change.
- Never stage `.env`, `node_modules/`, `*.sqlite`, or Xcode's `xcuserdata/`.

## Rules

- Keep changes small. Don't refactor code you weren't asked to touch.
- No API keys or private keys in the repo. Use environment variables.
- Every teammate must be able to explain the code (a hackathon rule), so prefer clear code over clever code and leave short comments on anything non-obvious.
- Disclose AI use: if you write or substantially change code, note it so the team can list it in the README.

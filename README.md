# Vouch YYC

Vouch YYC is a Prompt 2 prototype exploring how community work can become evidence of job-relevant skills. It includes a student dashboard, example projects, a community vouch form, simulated coordinator review, signed credentials, and an employer lens.

## Run

```sh
npm install
cp .env.example .env   # add GEMINI_API_KEY, GEMINI_MODEL, ADZUNA_APP_ID, ADZUNA_APP_KEY
npm start
```

Visit `http://localhost:8765/` in a recent browser with IndexedDB and Ed25519 Web Crypto support. Keys stay on the server (`server.mjs`); the browser never sees them. Without keys the app still runs: the lens falls back to clearly labelled offline keyword matching, and the Calgary job picker stays hidden. Fonts, icons, and the Unsplash image load from third parties.

### Employer Lens (`POST /api/lens`, `lens.mjs`)

1. Every submitted credential is verified with `verifyCredential`; invalid ones never reach the model.
2. One Gemini call (JSON-schema output) extracts up to 10 requirements and proposes matches, each citing a credential id and a verbatim quote.
3. Grounding in code: a match survives only if the credential is valid, the quote is a word-for-word substring of *that* credential's transcript, and praise isn't being used for a technical/credential requirement. Rejections are returned and shown under "Show what the AI proposed that we rejected".
4. Model error or 15 s timeout returns `{ fallback: true }` and the browser runs the keyword lens.

### Calgary jobs (`GET /api/jobs`, `adzuna.mjs`)

At startup the server fetches a few Calgary searches from Adzuna's Canada endpoint (5 calls) and caches them to `data/adzuna-cache.json` for 12 hours, so the demo doesn't depend on a live call. Adzuna search results usually carry a truncated description; the UI says so and links to the full posting.

## Demonstrate

1. Explore the fictional projects, then open **Give a vouch**. Type a testimonial, select skills, confirm the words, and proceed to the simulated coordinator review.
2. Approve the demo credential. The browser signs it with a locally generated Ed25519 key and stores it in IndexedDB.
3. Open the credential and use **Change a character**, then **Verify signature**. Verification fails after the change.
4. Open **Employer lens** and use the example job description. Matches show a skill and the exact signed quote; unsupported requirements remain gaps. Click a match to inspect the credential.

The first launch creates a signed fictional example. Removing browser site data deletes credentials and the issuer key. The public verification key is pinned to this browser's demo issuer; another device cannot independently verify these credentials through this prototype.

## Boundaries

- People, organizations, projects, and the example job are fictional. The simulated approval has no authentication and does not prove that a real organization or person approved anything.
- The signature is a compact Ed25519 JWS with a non-extractable private key stored in IndexedDB. This is a tamper-evident demo, **not** an Open Badges 3.0 credential or a production issuer identity. Code running on the same origin can request signatures; real deployment needs server-side key management, authenticated issuers, public key discovery, revocation, and access controls.
- The lens uses Gemini to extract requirements and propose matches, with a code-side word-for-word grounding check; it is not a hiring recommendation. Skill selections are made by the witness and are not independently validated; exact quotes are checked against the transcript, which does not establish that the selected skill is actually demonstrated.
- Browser speech recognition is optional and may transmit audio to the browser's speech provider. Review its privacy policy before using it. Typing is available; the app does not record or store audio itself. Avoid entering sensitive information.
- There is no Auth0, Postgres, public sharing, or actual partner organization integration. These need separate infrastructure, credentials, consent, and partner validation.
- The nine skill labels follow the [Skills for Success model](https://alis.alberta.ca/inspire-and-motivate/the-9-skills-for-success/the-skills-for-success-model). They are not officially assessed or endorsed.

## Checks

Run the signing, grounding and lens tests with `npm test` (Gemini is mocked, so tests run offline) using a recent Node.js version with Web Crypto Ed25519 support.
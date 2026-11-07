# Vouch YYC

Vouch YYC is a Prompt 2 prototype exploring how community work can become evidence of job-relevant skills. It includes a student dashboard, example projects, a community vouch form, simulated coordinator review, signed credentials, and an employer lens.

## Team Coordination

Each person and their AI agents should update their own section when starting, changing, or handing off work. Check the other sections before editing shared files. Replace the placeholders with current details; do not put credentials, licence information, or other sensitive data here.

### Teammate 1

- **Owner:** Unassigned
- **Status:** Available
- **Working on:** Not started
- **Files or areas:** Not assigned
- **Next step:** Choose a task
- **Blockers or handoff:** None
- **Last updated:** Not yet

### Teammate 2

- **Owner:** Unassigned
- **Status:** Available
- **Working on:** Not started
- **Files or areas:** Not assigned
- **Next step:** Choose a task
- **Blockers or handoff:** None
- **Last updated:** Not yet

### Teammate 3

- **Owner:** Unassigned
- **Status:** Available
- **Working on:** Not started
- **Files or areas:** Not assigned
- **Next step:** Choose a task
- **Blockers or handoff:** None
- **Last updated:** Not yet

## Run

Install the dependencies and start the local verification server (Node.js 22.23 or later):

```sh
npm install
npm start
```

Visit `http://localhost:8766/` in a recent browser with IndexedDB and Ed25519 Web Crypto support. A secure context (localhost or HTTPS) is required. The fictional demo works without an account or API key. Fonts, icons, and the Unsplash image load from third parties.

## Account Verification Setup

Account verification remains disabled until hosted providers are configured. Create an Auth0 Single Page Application and an Auth0 API, enable email verification, and add `http://localhost:8766/` to the application's allowed callback URLs, logout URLs, and web origins. Set the API identifier as the audience. Activate Stripe Identity in a Stripe account. Copy `.env.example` to `.env`, configure the values locally without committing secrets, and start with `node --env-file=.env server.mjs`.

The account page uses Auth0 sign-in and checks the account's email verification with Auth0. Stripe hosts the ID and selfie check; Vouch stores only its session ID and status, not licence images or numbers. The server checks that each session belongs to the authenticated user and uses a document plus matching selfie. Stripe test-mode results are explicitly marked test-only. Identity session attempts are limited per account and requests are rate limited per server process.

Stripe currently advertises the first 50 Identity verifications free, followed by CA$2 per completed document-and-selfie check in Canada. Confirm eligibility and current pricing with [Stripe](https://stripe.com/en-ca/identity#pricing) before using live mode. Test mode does not verify a real identity. No free alternative providing equivalent government-ID checks has been integrated.

Organization details are only **submitted for review**. Registry, official contact, and staff affiliation remain pending; there is no reviewer workflow or contact verification process yet. Identity deduplication also remains pending: Stripe document verification alone does not provide a reliable unique-person guarantee. The eligibility policy in `verification-policy.mjs` is tested but is **not wired to credential issuance**. All existing credentials and employer results are fictional local demos, not authenticated or verified backings. Do not use this prototype to establish employment credentials or collect real identity documents until a privacy, security, and legal review is completed and trusted identity deduplication, independent organization review, issuer authorization, revocation, and server-side backing issuance are implemented. The SQLite database and in-memory IP limiter are development-only, not a production deployment architecture.

## Badgr Badge Lookup

The employer lens can look up an explicitly public Badgr / Parchment Digital Badges hosted Open Badges 2 assertion by region and assertion ID. It requests only fixed provider domains and reports whether a public record was found, revoked, expired, or unavailable. The lookup does not use a private account token and does not prove that the badge belongs to the candidate, that the issuer is trustworthy, or that the badge passes complete Open Badges validation. Signed assertions and Open Badges 3 credentials are not supported. Never use a lookup result as a hiring decision.

The [Badgr API documentation](https://api.badgr.io/swagger-ui/index.html) specifies that authenticated issuer and backpack endpoints require bearer credentials and appropriate permissions. Connecting a recipient's private badge collection requires the provider's authorized OAuth integration and consent; it is not implemented here. No real badge or provider account was available for end-to-end testing, so tests use mock assertions.

## Demonstrate

1. Explore the fictional projects, then open **Give a vouch**. Type a testimonial, select skills, confirm the words, and proceed to the simulated coordinator review.
2. Approve the demo credential. The browser signs it with a locally generated Ed25519 key and stores it in IndexedDB.
3. Open the credential and use **Change a character**, then **Verify signature**. Verification fails after the change.
4. Open **Employer lens** and use the example job description. Matches show a skill and the exact signed quote; unsupported requirements remain gaps. Click a match to inspect the credential.

The first launch creates a signed fictional example. Removing browser site data deletes credentials and the issuer key. The public verification key is pinned to this browser's demo issuer; another device cannot independently verify these credentials through this prototype.

## Boundaries

- People, organizations, projects, and the example job are fictional. The simulated approval has no authentication and does not prove that a real organization or person approved anything.
- The signature is a compact Ed25519 JWS with a non-extractable private key stored in IndexedDB. This is a tamper-evident demo, **not** an Open Badges 3.0 credential or a production issuer identity. Code running on the same origin can request signatures; real deployment needs server-side key management, authenticated issuers, public key discovery, revocation, and access controls.
- The lens uses local keyword rules against valid signed credentials, not Gemini, semantic analysis, or a hiring recommendation. Skill selections are made by the witness and are not independently validated; exact quotes are checked against the transcript, which does not establish that the selected skill is actually demonstrated.
- Browser speech recognition is optional and may transmit audio to the browser's speech provider. Review its privacy policy before using it. Typing is available; the app does not record or store audio itself. Avoid entering sensitive information.
- There is no live Adzuna data, Gemini integration, Postgres, public sharing, actual partner organization integration, or production backing issuance. These need separate infrastructure, credentials, consent, and partner validation.
- The nine skill labels follow the [Skills for Success model](https://alis.alberta.ca/inspire-and-motivate/the-9-skills-for-success/the-skills-for-success-model). They are not officially assessed or endorsed.

## Checks

Run all trust, eligibility, and verification API tests with `npm test`. The API tests use simulated Auth0 and Stripe providers; real provider integration requires configured accounts and has not been exercised by these tests.
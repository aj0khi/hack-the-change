# Proofly

Proofly is a Prompt 2 prototype exploring how community work can become evidence of job-relevant skills. It includes a student dashboard, example projects, a community vouch form, simulated coordinator review, signed credentials, and an employer lens.

## Team Coordination

Each person and their AI agents should update their own section when starting, changing, or handing off work. Check the other sections before editing shared files. Replace the placeholders with current details; do not put credentials, licence information, or other sensitive data here.

### Teammate 1

- **Owner:** @aj0khi
- **Status:** Available
- **Working on:** Not started
- **Files or areas:** Not assigned
- **Next step:** Choose a task
- **Blockers or handoff:** None
- **Last updated:** 2026-11-07

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

Use Node.js 22.9 or later. Install the dependencies, copy `.env.example` to `.env` if you want to configure providers locally, and start the server:

```sh
npm ci
cp -n .env.example .env
npm start
```

`npm start` loads `.env` when present; environment variables already set by the host take precedence. Visit `http://localhost:8766/` in a recent browser with IndexedDB and Ed25519 Web Crypto support. A secure context (localhost or HTTPS) is required. The fictional demo works without an account or API key. Fonts, icons, and the Unsplash image load from third parties.

## Deploy to Hostinger

This app is a Node.js/Express web app, not a static-only site. Hostinger managed Node.js hosting is available on eligible plans; confirm that your plan includes Node.js applications before deploying. Hostinger's [Node.js deployment guide](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/) covers the current hPanel flow.

1. Push this repository to GitHub and connect it from **hPanel → Websites → Manage → Developer → Node.js** (the exact menu labels can vary). Import `aj0khi/hack-the-change` from the `main` branch.
2. Select Node.js 22.x or newer. Use the repository root as the application root, `server.mjs` as the entry file, `npm ci` as the install command, and `npm start` as the start command if requested. No build command is required. The app binds to `0.0.0.0` and uses the `PORT` supplied by the host.
3. Assign the temporary domain in hPanel and wait for HTTPS to be enabled. In the app's environment-variable settings, set `APP_ORIGIN` to the exact HTTPS origin, for example `https://your-temporary-domain` (no trailing slash). Do not set `PORT` yourself if hPanel supplies it.
4. Add these variables in hPanel; do not commit them to GitHub:

   | Variable | Value |
   | --- | --- |
   | `APP_ORIGIN` | Your exact temporary-domain HTTPS origin |
   | `AUTH0_DOMAIN` | Your Auth0 tenant hostname, without `https://` |
   | `AUTH0_CLIENT_ID` | Client ID for the **Proofly** Auth0 SPA |
   | `AUTH0_AUDIENCE` | Exact Identifier of your Auth0 API |
   | `STRIPE_SECRET_KEY` | Optional; use a Stripe test key for a demo, or leave unset |
   | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | Optional; LinkedIn developer app credentials for direct posting (see below) |
   | `VERIFICATION_DB` | Optional; a writable persistent path if your plan provides one |
   | `DEMO_CREDENTIAL_DB` | A writable, private, persistent SQLite path for the demo issuer key and published credentials |

   The Employer Lens also needs its AI and Adzuna variables; see [Employer Lens Setup](#employer-lens-setup).
5. In Auth0, add `https://your-temporary-domain/` to **Allowed Callback URLs** and **Allowed Logout URLs**, and `https://your-temporary-domain` to **Allowed Web Origins**. Keep the existing API Identifier as `AUTH0_AUDIENCE`; it does not need to be your website domain.
6. Save the variables and redeploy/restart the app. Check `https://your-temporary-domain/healthz` returns `{"status":"ok"}`, then open the site and test the demo and sign-in.

For local development, `.env` is ignored by Git; `.env.example` contains placeholders only. Never put Stripe secret keys or other credentials in `.env.example`, source files, screenshots, or commits. Hostinger's [environment-variable guide](https://docs.hostinger.com/node.js/environment-variables) explains setting values through hPanel.

The SQLite databases are not production databases. Set `DEMO_CREDENTIAL_DB` outside the deployment directory to a private persistent location on Hostinger; otherwise redeploys may delete the signing key and shared records, breaking existing links. Back up this database securely: it contains the private issuer key. Set `VERIFICATION_DB` to a persistent path if using account verification. The current identity and organization verification flows are not production-ready; see [Boundaries](#boundaries) before collecting real identity information.

## LinkedIn direct posting setup

1. Create a [LinkedIn developer app](https://www.linkedin.com/developers/apps) and request the **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect** products. LinkedIn must grant access to `w_member_social`, `openid`, and `profile`.
2. In the app's Auth settings, add the exact redirect URL `https://your-domain/api/linkedin/callback`, replacing `https://your-domain` with your configured `APP_ORIGIN` (for local testing use `http://localhost:8766/api/linkedin/callback` if LinkedIn accepts it).
3. Set `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` in Hostinger's environment settings and restart or redeploy. Keep the secret private and never commit it. The direct-post button is hidden until both are configured. Users must allow pop-ups and consent to LinkedIn's permissions.
4. Publish a fictional credential, select **Prepare LinkedIn post**, review the generated image and caption, connect LinkedIn, then explicitly select **Post publicly on LinkedIn**. The image is uploaded directly to LinkedIn, so the post does not rely on an automatic link preview. Check the LinkedIn profile after posting. If an error says the result is uncertain, check for the post before retrying.

The connection uses a short-lived, HTTP-only cookie and server-memory access token, expires after at most ten minutes, and is cleared after posting or disconnecting. A restart loses connections; this prototype requires a single server instance and is not a production session store. Disconnecting removes Proofly's local session; revoke the app in LinkedIn's settings to remove its authorization. LinkedIn may change its API or require app approval; the real integration requires a configured LinkedIn account and must be tested separately. The public post includes the fictional credential's student, project, issuer, skills, link and QR code; anyone with the link can see the full published demo.

## Project Layout

```
server.mjs            entry file: reads env, builds providers, listens (Hostinger imports it)
server-app.mjs        Express app: static files, /api/lens, /api/jobs, verification APIs, /healthz
index.html, app.js    the single-page app (all views)
styles.css            shared styles
trust.mjs             Ed25519 signing, verification and grounding (browser + Node)
lens/                 Employer Lens feature
  lens.mjs              verify credentials → one AI call → code-side grounding
  bedrock.mjs           Amazon Bedrock (Nova Lite) via the Converse API, forced JSON tool output
  adzuna.mjs            Calgary postings from Adzuna, cached to data/
  projects.mjs          community project catalog (browser + server)
  skills.mjs            Skills for Success keyword rules + Calgary demand counts
  student-pathway.mjs   browser-side skill hints, demo evidence and project suggestions
  lens.css              lens-only styles, loaded after styles.css
  *.test.mjs            lens, Bedrock and route tests (AI mocked)
verification/         account and organization verification (Auth0, Stripe Identity, Badgr, SQLite)
data/                 local caches: adzuna-cache.json, lens-cache.json (git-ignored)
```

## Employer Lens Setup

The lens uses Amazon Bedrock with Amazon Nova Lite (`us.amazon.nova-lite-v1:0` by default). In `.env` (see `.env.example`), set either `AWS_BEARER_TOKEN_BEDROCK` (a Bedrock API key) or `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` (an IAM user with `bedrock:InvokeModel`), plus `AWS_REGION` (default `us-east-1`) and optionally `BEDROCK_MODEL_ID`. Nova models must be enabled under **Bedrock → Model access** in that region. Add `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` for the Calgary job picker. `npm start` loads `.env` when present. Without these keys the lens uses clearly labelled offline keyword matching and the Calgary job picker stays hidden.

- `POST /api/lens` (`lens/lens.mjs`): verifies every credential's signature, makes one Bedrock call that extracts requirements and proposes matches, then keeps a match only if its quote is word-for-word in the cited, valid credential (praise never satisfies a technical or credential requirement). Rejected proposals are returned and shown in the UI. Model errors or a 26 s timeout return `{ fallback: true }`. The server allows 20 new lens requests a minute.
- `GET /api/jobs` (`lens/adzuna.mjs`): at startup fetches a few Calgary searches from Adzuna's Canada endpoint and caches them to `data/adzuna-cache.json` for 12 hours. Adzuna search results usually carry a truncated description; the UI says so and links to the full posting. Adzuna currently returns 500-character excerpts, so paste a full posting when you want a thorough check.
- **Student view and project suggestions:** choose a job or paste a posting, analyze it, and switch to Student view. The browser uses keyword hints from the posting and verifies its local demo credentials to show related evidence and skills without evidence, then links gaps to fictional projects from `lens/projects.mjs`. Two ideas are shown initially, with additional matches available under “Show more ideas.” Project cards are illustrative, not real placements; a demo vouch is entered separately. Specific tools such as SQL and Excel require their own mention in an evidence quote, rather than treating a general Digital tag as proof. These keyword hints are not a complete list of requirements, an assessment of ability, or a hiring prediction. Check the full posting, especially when Adzuna provides only an excerpt. Student view works independently of Bedrock; Employer view retains its AI or offline analysis.
- **Calgary demand:** `/api/jobs` also returns `demand`, a count of how many cached postings mention each Skills for Success skill, using the keyword rules in `lens/skills.mjs`. Suggestions show it as "mentioned in N of 30 Calgary posting excerpts". Because the counts come from excerpts, they undercount.
- **Saved results and quota:** a successful lens answer for the same posting, credentials and project catalog is saved in `data/lens-cache.json` and reused, marked "saved result", even after a restart. Catalog changes cause a fresh model call rather than reusing old suggestions. Bedrock is billed per token against your AWS credits (Nova Lite is one of the cheapest models); saving results also keeps demo re-runs instant. Credentials are stored in the browser, while the demo issuer key is stored on the server.

## Account Verification Setup

Account verification remains disabled until hosted providers are configured. Create an Auth0 Single Page Application and an Auth0 API, enable email verification, and add `http://localhost:8766/` to the application's allowed callback URLs and logout URLs; add `http://localhost:8766` to web origins. Set the API identifier as the audience. Activate Stripe Identity in a Stripe account. Copy `.env.example` to `.env`, configure the values locally without committing secrets, and run `npm start`.

The account page uses Auth0 sign-in and checks the account's email verification with Auth0. Stripe hosts the ID and selfie check; Proofly stores only its session ID and status, not licence images or numbers. The server checks that each session belongs to the authenticated user and uses a document plus matching selfie. Stripe test-mode results are explicitly marked test-only. Identity session attempts are limited per account and requests are rate limited per server process.

The Proofly product name does not need to match your Auth0 API audience. Keep `AUTH0_AUDIENCE` set to the exact identifier shown for your existing Auth0 API; changing the product branding does not require changing that identifier.

Stripe currently advertises the first 50 Identity verifications free, followed by CA$2 per completed document-and-selfie check in Canada. Confirm eligibility and current pricing with [Stripe](https://stripe.com/en-ca/identity#pricing) before using live mode. Test mode does not verify a real identity. No free alternative providing equivalent government-ID checks has been integrated.

Organization details are only **submitted for review**. Registry, official contact, and staff affiliation remain pending; there is no reviewer workflow or contact verification process yet. Identity deduplication also remains pending: Stripe document verification alone does not provide a reliable unique-person guarantee. The eligibility policy in `verification-policy.mjs` is tested but is **not wired to credential issuance**. All existing credentials and employer results are fictional local demos, not authenticated or verified backings. Do not use this prototype to establish employment credentials or collect real identity documents until a privacy, security, and legal review is completed and trusted identity deduplication, independent organization review, issuer authorization, revocation, and server-side backing issuance are implemented. The SQLite database and in-memory IP limiter are development-only, not a production deployment architecture.

## Badgr Badge Lookup

The employer lens can look up an explicitly public Badgr / Parchment Digital Badges hosted Open Badges 2 assertion by region and assertion ID. It requests only fixed provider domains and reports whether a public record was found, revoked, expired, or unavailable. The lookup does not use a private account token and does not prove that the badge belongs to the candidate, that the issuer is trustworthy, or that the badge passes complete Open Badges validation. Signed assertions and Open Badges 3 credentials are not supported. Never use a lookup result as a hiring decision.

The [Badgr API documentation](https://api.badgr.io/swagger-ui/index.html) specifies that authenticated issuer and backpack endpoints require bearer credentials and appropriate permissions. Connecting a recipient's private badge collection requires the provider's authorized OAuth integration and consent; it is not implemented here. No real badge or provider account was available for end-to-end testing, so tests use mock assertions.

## Demonstrate

1. Explore the fictional projects, then open **Give a vouch**. Type a testimonial, select skills, confirm the words, and proceed to the simulated coordinator review.
2. Approve the demo credential. The server signs it with its demo Ed25519 key; the browser stores the token in IndexedDB.
3. Open the credential and use **Change a character**, then **Verify signature**. Verification fails after the change.
4. On a credential, choose **Share**, read the warning, and choose **Publish and create link**. Scan the QR code on a phone to open the public `/verify/:id` page. The phone needs network access to the configured `APP_ORIGIN` (a localhost URL works only on the host computer).
   After publishing, **Prepare LinkedIn post** offers direct posting if configured above; **Open LinkedIn with link** opens LinkedIn's share composer, and **More sharing options** uses the device's share sheet when available. **Download demo image** creates a PNG with a QR code for manual sharing. No post is made without explicit confirmation, and nothing is added as a LinkedIn certification.
   The verification page supplies generic Open Graph metadata and a public preview image for social platforms. Previews never include the witness or testimonial, but anyone with the link (including platform crawlers) can access the full published page. The app serves a `robots.txt` explicitly allowing LinkedInBot while preserving the previous Googlebot restriction; a hosting CDN may override it. After deployment, check the public `/robots.txt` contains the LinkedInBot rule, then use [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/) to refresh the URL. The verification page retains its `noindex, nofollow` header; preview availability also depends on LinkedIn and hosting access to the page.
5. Open **Employer lens** and use the example job description. Matches show a skill and the exact signed quote; unsupported requirements remain gaps. Click a match to inspect the credential.

The first launch creates a signed fictional example. Existing browser-signed demo credentials can be migrated after the user consents to sending their contents to the server for re-signing. Sharing is opt-in: anyone with the link can see all displayed details, and links cannot currently be revoked. Clearing browser data removes local tokens but not published records.

## Boundaries

- People, organizations, projects, and the example job are fictional. The simulated approval has no authentication and does not prove that a real organization or person approved anything.
- The signature is a compact Ed25519 JWS; the private demo key and published tokens are stored in the server's SQLite database. Anyone can request a demo signature; it does not authenticate issuers or attest that claims are true. This is **not** an Open Badges 3.0 credential or a production issuer identity. Real deployment requires managed keys, authenticated issuers, public key discovery, revocation, consent, and access controls.
- The lens uses Amazon Nova Lite to extract requirements and propose matches, with a code-side word-for-word grounding check; it falls back to local keyword rules when the model is unavailable. It is not a hiring recommendation. Skill selections are made by the witness and are not independently validated; exact quotes are checked against the transcript, which does not establish that the selected skill is actually demonstrated.
- Browser speech recognition is optional and may transmit audio to the browser's speech provider. Review its privacy policy before using it. Typing is available; the app does not record or store audio itself. Avoid entering sensitive information.
- There is no Postgres, actual partner organization integration, or production backing issuance. Public links are for fictional demo content only.
- The nine skill labels follow the [Skills for Success model](https://alis.alberta.ca/inspire-and-motivate/the-9-skills-for-success/the-skills-for-success-model). They are not officially assessed or endorsed.

## Checks

Run all trust, lens, verification and startup tests with `npm test`. The lens tests mock the AI model and the verification tests use simulated Auth0 and Stripe providers, so they run offline; real provider integrations need configured accounts.
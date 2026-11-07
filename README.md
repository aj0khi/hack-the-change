# Vouch YYC

Vouch YYC is a Prompt 2 prototype exploring how community work can become evidence of job-relevant skills. It includes a student dashboard, example projects, a community vouch form, simulated coordinator review, signed credentials, and an employer lens.

## Run

Start a local server from this folder:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Visit `http://localhost:8765/` in a recent browser with IndexedDB and Ed25519 Web Crypto support. A secure context (localhost or HTTPS) is required; opening the HTML directly is not supported. No account or API key is required. Fonts, icons, and the Unsplash image load from third parties.

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
- There is no live Adzuna data, Gemini integration, Auth0, Postgres, public sharing, or actual partner organization integration. These need separate infrastructure, credentials, consent, and partner validation.
- The nine skill labels follow the [Skills for Success model](https://alis.alberta.ca/inspire-and-motivate/the-9-skills-for-success/the-skills-for-success-model). They are not officially assessed or endorsed.

## Checks

Run the signing and grounding tests with `node --test trust.test.mjs` using a recent Node.js version with Web Crypto Ed25519 support.
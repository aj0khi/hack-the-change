# Workflow: Change anything in the trust layer

**Objective:** Change signing, verification, the token, key encoding, or QR formats without the web and iOS apps disagreeing.

**Applies to:** `trust.mjs`, `trust.test.mjs`, `mobile/**/VouchTrust.swift`, QR strings `vouch:1:` and `vouchkey:1:`.

**Steps**
1. Write down the exact before/after format. Get the human to confirm before editing. This is a cross-platform contract.
2. Change `trust.mjs` and its tests first. Add a test for the new behaviour.
3. Run `bash tools/check.sh`.
4. Regenerate the fixture: `node tools/make_test_vector.mjs > tools/test-vector.json`.
5. Update `VouchTrust.swift` to match, and paste the new vector into `VouchTrustTests.swift`.
6. Tell the human the iOS tests must be re-run in Xcode (they cannot run here).
7. Update the "Contracts" section of `CLAUDE.md` if a format changed.

**Never**
- Weaken the grounding check (every skill needs an exact quote found in the transcript).
- Let verification pass on a parse error or an unknown key.
- Make the example data look like a real person or organization.

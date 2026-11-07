# Workflow: Add or change a feature

**Objective:** Ship a change that works, passes the gate, and doesn't break the demo path.

**Inputs:** What the feature should do, which platform (web, iOS, or both), and who asked.

**Steps**
1. Restate the change in one sentence. If it touches signing, tokens, keys, or QR formats, stop and use `workflows/change_trust_format.md` instead.
2. Read the files you will change. Name them before editing.
3. Make the smallest change that does the job. No new dependencies unless asked.
4. Run `bash tools/check.sh`. Fix failures before going further.
5. Manually walk the demo path if the change is user-facing: give a vouch → approve → open credential → tamper test → Employer Lens.
6. Report: what changed, which files, check result, anything you could not test.

**Edge cases**
- A failing check you did not cause: report it, don't "fix" unrelated code silently.
- UI change: keep 18px+ body text, visible focus, labels on inputs (the accessibility prize depends on it).

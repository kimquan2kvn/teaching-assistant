---
name: project-integration-branch-moves-mid-review
description: The orchestrator keeps merging task branches into the shared integration worktree (e.g. .worktrees/phase3-ui) while a reviewer is running — pin and report the reviewed SHA
metadata:
  type: project
---

On 2026-10-11 the Phase 3 UI review started at `feat/phase3-ui` = `a4fcb49`; during the review the orchestrator merged
main's backend fixes and Tasks 15–16 into the SAME worktree (tip `3c1257c`), so `git diff e51fab7..feat/phase3-ui`
suddenly included apps/api files and tests ran against a different tree than the one requested.

**Why:** reviewer and orchestrator share the worktree; branch names are moving targets.
**How to apply:** record `git rev-parse HEAD` at the start, diff against that SHA (not the branch name), state the SHA
in the report, and before handing back check `git diff --quiet <reviewedSHA> HEAD -- <reviewed files>` to say whether
findings still apply at the new tip.

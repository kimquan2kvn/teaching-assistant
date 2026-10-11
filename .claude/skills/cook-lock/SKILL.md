---
name: cook-lock
description: Use when the user provides a Jira task key for the B2B Login to Access (B2B Lock) project — e.g. "cook LOGIN-326", "do task LOGIN-412", "implement LOGIN-88". The skill reads the task description via the Atlassian MCP, then hands it to the orchestrator agent to coordinate (orchestrator → planner → coder / reviewer).
---

# cook-lock

This skill is the entry point to "cook" a Jira task into a feature for the **B2B Lock** project.
The input is **a single Jira issue key** (e.g. `LOGIN-326`). The skill does NOT implement anything itself — it:
1. Reads the task content from Jira via the **Atlassian MCP**
2. Hands it to the **orchestrator agent** (`.claude/agents/orchestrator.md`) to coordinate; the orchestrator calls the **planner agent** to plan before coding.

## When to use this skill

- The user provides a Jira key and wants that task done (e.g. "cook LOGIN-326", "implement task LOGIN-412").
- The task is large enough to require splitting into phases and coordinating multiple roles (plan → code → review).

If the user only describes a feature in text without a Jira key → ask for the key, or skip the Jira-reading step and hand the description straight to the orchestrator.
For simple lookups or one-line changes → this skill is NOT needed.

## How it works

### Step 1 — Read the task from Jira (Atlassian MCP)

From the Jira key the user provides (e.g. `LOGIN-326`):

1. Call `getAccessibleAtlassianResources` → get the `cloudId`.
2. Call `getJiraIssue` with `cloudId` + `issueIdOrKey` = the Jira key → get the **summary**, **description**, and related fields (acceptance criteria, labels, linked issues).
3. Summarize the requirement (WHAT needs to be achieved) from the task content. If the description is missing/unclear → note it as an open question; do not invent scope.

> If the Atlassian MCP is not authorized yet, tell the user to authorize the connector first, then stop.

### Step 2 — Dispatch to the orchestrator

Call the Agent tool with `subagent_type: "orchestrator"`, passing:
- The Jira key
- The task content read in Step 1 (summary + description + acceptance criteria)
- A description of WHAT needs to be achieved (NOT HOW).

### Step 3 — Orchestrator coordinates

The orchestrator agent will:
- Call `planner` to get an implementation plan + file assignments (based on the Jira task content passed in).
- Split into phases based on file overlap (no overlap → run in parallel).
- Assign each task to `coder` (and `reviewer` to review the results).
- Consolidate and report progress after each phase.

### Step 4 — Follow the project's hard rules

The orchestrator and its subagents must follow `.claude/CLAUDE.md`:
- New logic only goes into `login-api-v2`; do not modify `login-api` (v1)
- Do not modify `upload.service.ts` without understanding the upload flow
- The Hide Section/Block feature must read `docs/technical/be/hide-section.md` first
- New entities must have a migration

## Example

User: "cook LOGIN-326"

→ Step 1: `getAccessibleAtlassianResources` gets the cloudId → `getJiraIssue` LOGIN-326 → reads "Hide product price by customer tag".
→ Step 2: call the orchestrator with a prompt including the task content: *"[LOGIN-326] Implement the feature to hide product price by customer tag for B2B Lock. Acceptance criteria: ..."*
→ Step 3: orchestrator → planner plans → splits into phases → coder implements → reviewer reviews → reports.

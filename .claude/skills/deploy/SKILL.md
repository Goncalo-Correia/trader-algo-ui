---
name: deploy
description: Deploy the trader-algo-ui project. Use when the user asks to "deploy" the project (or "deploy to main", "ship it"). Refreshes CLAUDE.md and README.md, commits and pushes the dev branch, then merges dev into main and pushes main.
---

# Deploy

Run this workflow when the user asks to deploy the project. Perform the steps in order and stop if any step fails, reporting the failure rather than continuing.

## 1. Refresh documentation

Review recent changes and update the docs so they reflect the current state of the build:

- **`CLAUDE.md`** — update the architecture, conventions, commands, or deployment notes if the code has drifted from what's documented. Inspect the working tree and recent commits (`git log`, `git diff main...dev`) to find what changed.
- **`README.md`** — update setup/usage/feature descriptions to match the current build.

Only change what is actually out of date. If both files are already accurate, note that and make no edits.

## 2. Commit and push dev

Confirm the current branch is `dev` first (`git branch --show-current`). If it is not `dev`, stop and tell the user rather than deploying from the wrong branch.

```bash
git add -A
git commit -m "<concise message describing the changes being deployed>"
git push origin dev
```

If there is nothing to commit, skip the commit but still ensure `dev` is pushed (`git push origin dev`).

Follow the repo commit conventions, ending the commit message with:

```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

## 3. Merge into main and push

```bash
git checkout main
git pull origin main
git merge dev
git push origin main
git checkout dev
```

Resolve fast-forward vs. merge-commit naturally; if there are merge conflicts, stop and report them to the user instead of guessing at resolutions.

## 4. Report

Summarize what was done: which docs were updated, the dev commit, and confirmation that `main` was updated and pushed. End on `dev` (the working branch).

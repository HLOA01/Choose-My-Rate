# Choose My Rate AI Workflow

## Active Workspace

All AI/Codex work should happen in the root app:

```text
C:\Users\Owner\OneDrive\Desktop\choose-my-rate
```

## Nested Repo Boundary

Do not edit the nested repo unless explicitly instructed:

```text
C:\Users\Owner\OneDrive\Desktop\choose-my-rate\Choose-My-Rate
```

## Main Root App Folders

Primary folders for root app work:

```text
src/
src/components/
src/hooks/
src/scenario/
src/pricing/
src/comparison/
src/loanPurpose/
```

## Backend And Pricing Engine

The PRMG backend lives separately and should not be touched unless requested.

## Current Development Approach

Build in small passes:

1. Pure helpers first
2. Hooks second
3. Read-only UI third
4. Sally triggers last

## Rules

- Do not redesign UI unless requested.
- Do not change pricing logic unless requested.
- Do not touch voice unless requested.
- Always run `npm.cmd run build`.
- Report files changed.
- Commit after stable passes.

## Current Next Planned Feature

Refinance Comparison Pass 1

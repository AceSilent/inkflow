# GPT-5.6 Support Design

## Goal

Add all three official GPT-5.6 preview model IDs to InkFlow's Codex OAuth provider without changing the user's currently selected author, editor, or reviewer models.

Supported model IDs:

- `gpt-5.6-sol`
- `gpt-5.6-terra`
- `gpt-5.6-luna`

## Model Catalog Behavior

`gpt-5.5` remains InkFlow's preferred Codex default while GPT-5.6 is in limited preview. New Codex providers include the three GPT-5.6 models alongside the existing recommended models.

When settings are loaded, existing Codex providers receive any missing recommended GPT-5.6 model IDs. The merge preserves the provider's current model order, custom entries, and all active model assignments. It does not silently switch an author, editor, or reviewer to GPT-5.6.

## Transport

GPT-5.6 model IDs pass through the Codex Responses API unchanged. InkFlow continues to use streaming requests, `store: false`, and encrypted reasoning continuation data. The Codex client version header is updated to the locally verified official CLI version required by the current backend generation.

The preview is entitlement-gated. InkFlow must preserve the backend's access error instead of treating an unavailable GPT-5.6 model as a local configuration or authentication failure.

## Context Management

InkFlow does not introduce an inferred GPT-5.6 context-window size while official preview documentation omits that value. The existing conservative fallback remains in effect until OpenAI publishes a model-specific limit.

## Verification

- Frontend tests prove new and existing Codex providers expose all three GPT-5.6 IDs without changing active assignments.
- Backend tests prove GPT-5.6 IDs are passed through unchanged and requests use the updated Codex client version.
- Existing frontend and server suites remain green.
- A real Codex OAuth smoke request distinguishes successful access from a clear upstream preview-entitlement rejection.

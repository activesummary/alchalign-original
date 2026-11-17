# Architecture and source map

This describes the **code included in the supplied archive**, not a reconstructed deployment.

## High-level flow

1. Visitors interact with WordPress-hosted frontend page code in `frontend/`.
2. Product-specific pages submit to Pipedream HTTP workflows (the original URLs are redacted here).
3. Pipedream steps prepare input and prompts, send requests to OpenAI, then process and return reports or deliver email.
4. Separate Stripe and claim/entitlement workflows support purchase validation and access management.
5. Report pages and shared email delivery components present the generated content.

## Workflow step sequence

| Workflow | Original steps (in execution order) |
| --- | --- |
| Fathom | `preflight` → `prepare_prompt` → `custom_prompt` → `respond_to_client` → `optional_email` |
| Sliproot | `generate_sliproot_v2` → `respond` → `email_sliproot_v2_resend` |
| AlignDaily | `pp_static_assets` → `prepare_prompt_core` → `custom_request` → `return_plan` → `send_email` |
| AlignmentScan | `prepare_prompt` → `custom_prompt` → `format_result` → `send_email_if_requested` |

The `trigger` steps, configuration and external app connections were part of Pipedream's UI and are **not fully represented** in the exported text files.

## Supporting workflows

`checkout.js`, `entitlements.js`, `redeem-claim.js`, `stripe-webhook.js`, and `shared-email.js` were separately captured as code blocks. They rely on Pipedream context and environment variables and are not standalone services.

## Frontend format

Files in `frontend/` retain their original descriptive names and formats. Each `.txt` document may have labeled blocks such as `RAW HTML`, CSS or JavaScript that were deployed into CMS pages. They are source captures, **not browser-ready files**.

## Code history fidelity

The collected source was split into files at original `STEP N:` boundaries, with step names and contents otherwise retained apart from endpoint redaction and newline normalization. No claim is made that the collection includes every historic revision, external configuration, or previously deployed artifact.

# alchAlign — Original AI Platform (Archived Source)

This repository documents selected source code from the **original alchAlign AI-powered wellness and guidance platform**, developed before its discontinuation and subsequent change in direction. **It is an historical technical archive, not the current alchAlign product and not a ready-to-run application.**

## What the platform did

The original platform combined a website and product-specific intake forms with payment and account-access workflows, OpenAI-powered content generation, and report delivery. The included product implementations are:

- **Fathom** — personalized insight generation
- **Sliproot** — guided pattern reflection
- **AlignDaily** — personalized fitness and meal-plan generation
- **Alignment Scan** — personalized alignment report generation

Additional Pipedream workflows handled Stripe checkout events, account entitlements, claim and redemption logic, and transactional email delivery.

## Repository layout

```text
frontend/                     Captured WordPress page markup, styles, scripts and sitewide code
pipedream/workflows/          JavaScript steps separated in original workflow order
  fathom/
  sliproot/
  aligndaily/
  alignmentscan/
pipedream/supporting-workflows/   Checkout, entitlement, claims, email, Stripe webhook steps
docs/                         Architecture and source-mapping notes
```

The frontend files are **original page-code captures** (mostly `.txt`), not standalone HTML applications: some include separate labeled HTML/CSS/JS snippets intended to be placed in a CMS. The `Main Dashboard.rtf` file retains its captured rich-text format. Each separated workflow step is Pipedream component source, **not an independently executable JavaScript program**. Connections, environment variables, external services, Pipedream settings and the WordPress installation are not included.

## Technical architecture

The application used **Pipedream / JavaScript (Node.js)** to orchestrate HTTP-triggered workflows, **OpenAI APIs** for generated content, **Stripe** for payment-related events, and **Resend** for transactional email. Product-specific frontend pages handled intake, report display and account interactions. See [architecture notes](docs/ARCHITECTURE.md).

## Selected engineering concerns

- **Transaction and access handling:** payment-confirmation events, access claims and purchased-credit redemption logic
- **Generation workflow orchestration:** intake, prompt preparation, model requests, response shaping and delivery
- **Output design:** structured instructions and format constraints intended to improve generated reports
- **Operational handling:** code paths for errors and timeouts, with customer-facing responses and entitlement/credit-related logic

These describe code present in the archive, **not independently verified production performance or an assurance that every output met its intended requirements**.

## Development and attribution

The founder defined the product, requirements, customer experience and workflows, directed implementation and iterative testing, and used AI-assisted coding to develop and troubleshoot code. The repository documents the implementation and the founder’s product ownership.

## Important limitations

- Archived and **not maintained**. Dependencies, APIs and original endpoints may be obsolete.
- Original Pipedream URLs were replaced with `https://redacted-pipedream-endpoint.invalid` before publication. This version is intentionally not deployable.
- Secrets, environment variables, customer data, Stripe account configuration and Pipedream connection settings are not supplied.
- The source has not undergone comprehensive security, clinical-safety, legal or operational verification. It should **not** be used to provide health guidance or accept payments as-is.


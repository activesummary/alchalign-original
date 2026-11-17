# alchAlign — Original AI Platform

**An archived look at the AI-powered wellness and personal guidance platform I designed, built, and launched.**

The original alchAlign turned customer intake forms into individualized reports and plans. I developed the product experience and the workflows that connected payments, customer access, AI generation, and delivery. This repository preserves selected source code from that version of the platform, which has since been discontinued as alchAlign takes a new direction.

## What I built

- **Fathom:** Personalized insight reports
- **Sliproot:** Guided reflection on recurring patterns
- **AlignDaily:** Individualized fitness and meal plans
- **Alignment Scan:** Personalized alignment reports

The supporting system included Stripe checkout, customer entitlements and paid credits, product-specific forms, automated report generation, and transactional email.

## How it worked

**Typical report-generation flow:**

`WordPress storefront → Stripe checkout → Pipedream validation & entitlements → gated intake forms → Pipedream generation workflows → OpenAI generation → formatted report → Resend delivery`

The frontend ran on **WordPress** with custom HTML, CSS, and JavaScript. **Pipedream workflows** used JavaScript (Node.js) to process submissions, prepare structured prompts, call **OpenAI APIs**, shape the results, and deliver reports. **Stripe** handled payments, and **Resend** handled transactional email.

Some of the implementation challenges included:

- **Protecting paid credits:** Handling failed generation requests so customers did not lose credits when a report wasn't produced.
- **Improving output consistency:** Iteratively testing and refining prompts against product-specific content, structure, and quality requirements.
- **Connecting the full customer journey:** Coordinating purchase validation, access, intake, generation, and delivery across services.

## Explore the source

- [`frontend/`](frontend/) — Original page-code captures and sitewide scripts
- [`pipedream/workflows/`](pipedream/workflows/) — Product-generation workflow steps, organized by product
- [`pipedream/supporting-workflows/`](pipedream/supporting-workflows/) — Checkout, entitlements, credit redemption, webhooks, and email
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Technical architecture and workflow notes

## About this archive

I led the product design, requirements, workflow design, implementation, testing, and troubleshooting, using **AI-assisted coding** throughout development.

The files document the original system rather than a runnable release. They include Pipedream step code and WordPress page snippets; credentials, service connections, and original endpoints are not included.

For the project story, see [my alchAlign case study](https://csanders.netlify.app/project).

## License

**All rights reserved.** Source code is provided for review purposes only.

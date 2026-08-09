# Vesence — Complete Technical Stack

*Sourced from vesence.com: subprocessor list (updated 20 May 2026), security page, platform pages, engineering blog. August 2026.*

---

## Summary

Everything runs on Microsoft Azure in the EU. The AI layer routes to three interchangeable providers, and the customer picks which ones are allowed. The one piece built in-house is a proprietary Word engine that reads and writes the full OOXML specification.

Their entire subprocessor list is **three legal entities**. That is a deliberate choice, and it is one of the most instructive things about the company.

---

## Infrastructure

**Microsoft Azure — required, and it is nearly the whole stack.**

Contracting entity: Microsoft Ireland Operations Limited. Their subprocessor page lists Azure as covering: application hosting, compute, storage, database, identity and access management, Azure OpenAI, transactional email, telemetry and logging.

Read that list again. There is no separate database host, no SendGrid or Resend, no Datadog or Sentry, no Auth0 or WorkOS. Every one of those functions is an Azure service.

**Regions**

| Component | Region |
|---|---|
| Primary service | Sweden Central |
| Static Web Apps (the front end) | West Europe |
| Azure OpenAI inference | EU regional or EU DataZone deployments |

The front end runs on **Azure Static Web Apps**. All processing is in the European Union — they state this as a GDPR and data sovereignty commitment.

**Architecture properties they publish:** zero-trust, every request verified. Redundant with automatic failover and point-in-time recovery. Logical tenant isolation. Documents processed in memory and not persisted beyond the session. TLS 1.3 in transit, AES-256 at rest.

---

## The AI layer

Three routes. **The customer chooses which providers are enabled for their environment** — this is the architecturally interesting part.

**1. Azure OpenAI (Microsoft)** — the default path. EU regional or EU DataZone deployment for EU traffic; global deployments are not used for EU customers unless the customer expressly accepts a wider processing scope.

The important detail: **Vesence holds Microsoft Modified Abuse Monitoring approval on all production Azure OpenAI accounts.** By default Azure OpenAI stores prompts and completions for abuse monitoring, with possible human review. The approval waives that storage and removes the human review. It is what lets them say not even Microsoft can read customer documents. It has to be applied for.

**2. AWS Bedrock** — Amazon Web Services EMEA SARL, Luxembourg, running in **eu-central-1 (Frankfurt)**. This is the Claude route. They note that under Bedrock, model providers have no access to logs, prompts or completions — which is why Anthropic is not listed as a separate subprocessor.

**3. OpenAI Direct** — OpenAI Ireland Ltd, restricted to zero-data-retention-eligible endpoints only.

**Models named on the platform pages:** GPT-5.6 Sol, GPT-5.6 Terra, GPT-5.5, Opus 5, Opus 4.8, Gemini 3.5 Flash. Note that Google is not on the subprocessor list, so the Gemini route is either unreleased or served another way.

---

## The Word engine

This is the only thing they built rather than bought, and they describe it directly:

*"We built a proprietary Word engine from scratch. Not a wrapper around python-docx. Not a markdown converter. A purpose-built engine that understands the full OOXML specification: styles, numbering, tables, cross-references, tracked changes, headers, footers, and every formatting property that Word cares about."*

Their stated reasoning for why the alternatives fail: converting to markdown and back loses styles, margins and page breaks; python-docx and MCP servers cover only a fraction of the OOXML spec; editing raw XML is brittle at real document length.

Edits are written as **native Word tracked changes** — real revisions, accepted or rejected one at a time. The same engine powers both the add-in and the web app's bulk review across hundreds of files.

---

## Client surfaces

| Surface | Notes |
|---|---|
| **Word** | Native add-in, task pane, edits the live document |
| **Outlook** | Add-in, tracked changes inside email |
| **Excel** | Add-in, formula explanation, cross-checks figures against source documents |
| **PowerPoint** | Add-in, slide-level checks |
| **Web app** | app.vesence.com — matters, files, bulk review, admin |

Desktop and mobile — a task started at a desk continues on a phone.

---

## Identity and access

- **Microsoft Entra ID** with token-based authentication
- SAML and single sign-on through the firm's own identity provider
- Role-based access control, least privilege
- Multi-factor authentication enforced on all accounts
- Audit logging and automated session management

---

## Integrations

SharePoint, OneDrive, Outlook, Teams, and document management systems — so agents work from the firm's existing files.

---

## Compliance

- SOC 2 Type II
- GDPR, all processing in the EU
- Regular third-party security audits and vulnerability assessments
- Incident response plan with defined SLAs
- DPA with subprocessor change notification and a customer right to object
- Content filtering and abuse monitoring disabled at the Azure level
- No training on customer data

---

## Not disclosed

They publish infrastructure and data handling in detail but not application internals. Unknown: backend language and framework, the specific database engine, job queue, vector store or retrieval architecture, and evaluation tooling.

---

## Six observations worth carrying

**1. Three subprocessors is a strategy, not an accident.** Every vendor is a line a law firm's risk team must review and can veto. By running everything on Azure — including email and logging — they present a review surface of one required vendor plus two optional ones. Compare that against a typical startup stack of ten SaaS tools.

**2. Customer-selectable inference is a procurement weapon.** A firm that won't permit OpenAI can run Claude through Bedrock. A firm that demands EU-only processing gets an EU DataZone deployment. The routing flexibility closes objections that would otherwise end a deal.

**3. The abuse-monitoring waiver is a specific, obtainable asset.** It is what backs the strongest sentence on their security page. It requires an application to Microsoft, and it is worth knowing about early.

**4. The Word engine is the real technical moat.** Not the agents, not the models — the OOXML engine. Harvey published a piece in March 2026 describing the same problem and shipping their own Word editing in September 2025. Both companies independently concluded this had to be built rather than bought.

**5. Everything is European.** Sweden Central, West Europe, Frankfurt, EU DataZone, GDPR framing throughout. For US law firms and US case law, that is a mismatch — and a US-hosted competitor has a straightforward answer to a question Vesence would have to work around.

**6. Their security page is a sales document.** It is detailed, specific, and written for a firm's IT and compliance team rather than for a lawyer. That is the audience that decides, and the page is built for them.

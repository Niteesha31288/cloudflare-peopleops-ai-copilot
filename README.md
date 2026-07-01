# PeopleOps AI Copilot

Safe AI workflows for employee support and lifecycle requests on Cloudflare Workers.

This project is a compact People Ops request router that classifies sensitive employee-support requests, retrieves synthetic HR policy context, creates a recommended workflow, requires human review for risky actions, and stores an auditable trail in a Durable Object.

## Live Demo

Click here to access deployed url :-
[Open PeopleOps AI Copilot](https://cloudflare-peopleops-ai-copilot.thottempudi-niteesha.workers.dev/)

<img width="1440" height="900" alt="Screenshot 2026-06-30 at 9 45 10 PM" src="https://github.com/user-attachments/assets/d59c2d09-61cf-45f7-9be9-e20c025a92ea" />
<img width="1440" height="900" alt="Screenshot 2026-06-30 at 9 45 19 PM" src="https://github.com/user-attachments/assets/6b9cea6e-3f83-44d1-9b7c-3556ded45b48" />
<img width="1440" height="900" alt="Screenshot 2026-06-30 at 9 45 33 PM" src="https://github.com/user-attachments/assets/161576ad-8175-41fe-be4f-f8acc1c3a30f" />
<img width="1440" height="900" alt="Screenshot 2026-06-30 at 9 45 37 PM" src="https://github.com/user-attachments/assets/855cf06d-221b-4d56-80fe-07a2e63a4ce2" />
<img width="1440" height="900" alt="Screenshot 2026-06-30 at 9 46 35 PM" src="https://github.com/user-attachments/assets/c78e144d-825a-4a8c-8ab5-2dcd2df90b4e" />

## Platform Components

| Requirement | Implementation |
| --- | --- |
| LLM | Workers AI Llama 3.3 classifier with deterministic local fallback |
| Workflow / coordination | Cloudflare Worker coordinates classification, retrieval, risk checks, routing, and audit creation |
| Durable memory / state | Durable Object stores session summaries and audit records |
| User input via chat or voice | TypeScript-powered chat intake UI served by the Worker at `/` |
| AI-powered behavior | Request classification, lightweight RAG over People Ops policy docs, workflow recommendation, risk evaluation |
| Prompt history | See `PROMPT_HISTORY.md` |

## Why This Project

People Ops teams receive repetitive, policy-heavy, and sensitive requests like remote work exceptions, onboarding, offboarding, manager changes, benefits routing, recruiting coordination, and access changes. Those requests are easy to route incorrectly and unsafe to fully automate.

The copilot helps by:

- Accepting a People Ops request through a chat-style intake UI.
- Classifying the request as policy, onboarding, offboarding, manager change, benefits, recruiting, access, or unknown.
- Retrieving relevant context from synthetic policy documents in `policies/`.
- Producing a workflow plan with missing information, routing, risk, and review requirements.
- Storing every decision in a Durable Object audit log.
- Avoiding sensitive actions unless a human reviewer approves.

## Cloudflare Architecture

```text
User Chat UI
  -> Cloudflare Worker API
  -> Workers AI Llama 3.3 classifier
  -> Lightweight retrieval over synthetic policy documents
  -> Risk and sensitivity evaluator
  -> Durable Object for workflow state and audit records
  -> Audit log and human review queue
```

The app uses a deterministic classifier fallback when Workers AI is unavailable, which keeps local demos predictable.

## Design Goals

This app is intentionally scoped around People Ops workflow automation themes:

- AI-assisted intake for request classification and case routing.
- Retrieval-augmented responses from synthetic HR policy documents.
- Durable state for lifecycle workflows and audit records.
- Human review before sensitive employee, access, benefits, payroll, or lifecycle actions.
- Observable audit records that explain classification, policy sources, risk, routing, model, and status.
- Data minimization: demo data is synthetic and the app avoids collecting unnecessary personal details.

## Features

- Chat intake at `/`
- Frontend behavior split into TypeScript modules served from `/assets/home.js` and `/assets/audit.js`
- Request classification with Workers AI and heuristic fallback
- Lightweight RAG-style retrieval over synthetic People Ops policies
- Workflow recommendation with routing and missing information
- Human review flags for lifecycle, access, benefits, payroll, health-adjacent, and unknown requests
- Human-review actions on audit records: approve, reject, or mark complete
- Durable Object backed audit log at `/audit`

## Exact MVP Scope

This project is a focused prototype of an AI-assisted People Ops workflow layer. It is designed to demonstrate the architecture and safety pattern, not to be a complete HRIS, ATS, payroll, identity, or benefits platform.

In scope:

- Classify People Ops requests into these request types:
  - `POLICY_QUESTION`
  - `ONBOARDING`
  - `OFFBOARDING`
  - `MANAGER_CHANGE`
  - `LOCATION_CHANGE`
  - `BENEFITS`
  - `RECRUITING`
  - `ACCESS_REQUEST`
  - `UNKNOWN`
- Retrieve lightweight policy context from synthetic Markdown policy documents.
- Generate a recommended workflow with:
  - request type
  - risk level
  - missing information
  - routed teams
  - policy sources
  - human-review requirement
  - audit status
- Persist audit records and review state in a Durable Object.
- Let a human reviewer approve, reject, or mark a recommendation complete from the audit page.

Out of scope:

- Real employee data.
- Real HRIS, Greenhouse, payroll, benefits, identity, Slack, or ticketing integrations.
- Sending emails, creating tickets, provisioning accounts, updating employee records, or changing payroll/benefits/access.
- Full vector search or embeddings. Retrieval is keyword-based for MVP scope.
- Full authentication and authorization. A production version should protect routes with Cloudflare Access or equivalent controls.
- Complete policy coverage for every People Ops scenario.
- Guaranteed classification accuracy across all edge cases. The app includes deterministic guardrails and auditability, but policy/routing logic should expand as new scenarios appear.

## Policy Coverage

The current policy set is intentionally small and synthetic:

- `remote-work-policy.md`
- `onboarding-policy.md`
- `offboarding-policy.md`
- `access-review-policy.md`
- `benefits-policy.md`
- `recruiting-policy.md`

Some request types intentionally reuse related sources. For example, `LOCATION_CHANGE` uses remote-work, benefits, and access-review context because a permanent move can affect location, payroll, benefits, manager approval, and access controls.

Future policies that would make the project more complete:

- `location-change-policy.md`
- `leave-policy.md`
- `payroll-change-policy.md`
- `compensation-policy.md`
- `employee-data-change-policy.md`
- `immigration-visa-policy.md`
- `manager-transfer-policy.md`
- `security-access-policy.md`

To add a new policy or scenario:

1. Add a policy file under `policies/`.
2. Add its synthetic text and keywords to `POLICY_DOCUMENTS` in `src/peopleops.ts`.
3. Add or tune the request type if needed.
4. Update `ROUTES`, `evaluateRisk`, `missingInfoFor`, and `workflowFor`.
5. Add a demo prompt to this README.
6. Run `npm run typecheck`, then redeploy with `npm run deploy`.

## App Routes

- `GET /` renders the PeopleOps Copilot chat intake.
- `GET /assets/home.js` serves the TypeScript-authored browser module for the chat UI.
- `GET /assets/audit.js` serves the TypeScript-authored browser module for the audit UI.
- `POST /api/request` classifies a request, retrieves policy sources, creates a recommendation, and writes an audit record.
- `GET /audit` renders the audit log page.
- `GET /api/audit` returns audit records from the Durable Object.
- `PATCH /api/audit/:id` updates review status and reviewer notes.

## Tech Stack

- Frontend: TypeScript-authored browser modules, HTML, and CSS served by the Worker.
- Backend/API: TypeScript Cloudflare Worker.
- AI: Workers AI with Llama 3.3, plus deterministic fallback for local development.
- State: Cloudflare Durable Objects.
- Retrieval: Lightweight keyword retrieval over synthetic policy Markdown documents.
- Tooling: Wrangler and TypeScript.

## Demo Prompts

1. `Can I work remotely from another country for 3 weeks?`
2. `A manager says a new employee is joining the Platform team next Monday. Create an onboarding workflow, identify missing information, and route approval steps.`
3. `An employee is moving teams and needs production access updated. What approvals are needed?`
4. `Please offboard an employee whose last day is Friday and make sure access is removed.`
5. `A recruiter wants to update a candidate's offer details after the hiring manager changed the role level. Identify who should review it, what policy context applies, and whether the copilot can complete the change automatically.`
6. `An employee says they are moving from the US to Canada permanently and asks what People Ops needs to update for location, payroll, benefits, manager approvals, and system access. Create a workflow and flag any risks.`

## Local Development

Install dependencies:

```bash
npm install
```

Run the Worker locally:

```bash
npm run dev
```

`npm run dev` automatically bundles the TypeScript frontend modules before starting Wrangler.

Then open the local Wrangler URL and submit one of the demo prompts.

Run all checks:

```bash
npm run typecheck
```

## Deployment

```bash
npm run deploy
```

`wrangler.toml` defines:

- `AI` binding for Workers AI.
- `PEOPLEOPS_STATE` Durable Object binding.
- A SQLite Durable Object migration.

## Safety Notes

The repository uses only synthetic policy content and does not require real employee data. The copilot generates recommendations and audit records, but it does not modify HRIS, payroll, identity, benefits, recruiting, or access systems.

Sensitive actions intentionally stop at `pending_review` until a human reviewer approves the next step.

This safety boundary is deliberate: the app prepares context and workflow recommendations for a reviewer, but it does not execute sensitive People Ops actions automatically.

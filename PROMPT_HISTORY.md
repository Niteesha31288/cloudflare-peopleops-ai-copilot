# Prompt History

This project was built with AI-assisted coding. The key prompts/context used are summarized below to document what help was requested and how the project evolved.

## Prompt 1: Project Selection and Scope

The initial prompt asked Codex to anchor the project around People Ops workflows, sensitive employee data, LLM/RAG, durable workflows, human review, auditability, and Cloudflare platform primitives:

```text
Build an “AI People Ops Request Router + Lifecycle Workflow Copilot”

The app should:
- Accept a People Ops request through chat.
- Classify the request type.
- Retrieve relevant policy/context.
- Generate a safe response or action plan.
- Create a durable workflow with required approval steps.
- Store memory/state.
- Create an audit log explaining what happened and why.
- Never perform sensitive actions automatically without human review.
```

Codex then scaffolded a Cloudflare Worker project with:

- Chat intake UI.
- Workers AI Llama 3.3 classification with heuristic fallback for local development.
- Lightweight retrieval over synthetic policy documents.
- Risk and sensitivity evaluation.
- Durable Object storage for session/audit state.
- Audit log UI.

## Frontend TypeScript Refactor

The project was later prompted to refactor browser behavior into TypeScript modules while keeping the backend Cloudflare-native:

```text
Refactor frontend JS into TypeScript modules and keep the backend as TypeScript Cloudflare Workers.
```

Codex then split the browser logic into typed frontend modules, added a small build script, and served the generated browser assets from the Worker.

## Human Review and Guardrails Prompting

The project was intentionally prompted to avoid full automation for sensitive People Ops workflows:

```text
Never performs sensitive actions automatically without human review.
Human review required for employee lifecycle workflows, identity/access changes, benefits, payroll, health-adjacent information, and unknown requests.
```

That instruction is reflected in the implementation by marking sensitive workflows as `pending_review` and routing them to the appropriate human teams.

## Audit Review Workflow

The audit UI was improved with human-review actions:

```text
Add buttons on each audit card: Approve, Reject, Mark Complete.
```

Codex wired those buttons to the existing `PATCH /api/audit/:id` endpoint so review decisions update the Durable Object audit record with status, reviewer note, and review timestamp.

## Classification Tuning

Several demo prompts exposed classifier edge cases. Codex helped tune the rules so:

- Recruiting/candidate/offer requests are not misclassified as manager changes.
- Permanent employee moves are classified as `LOCATION_CHANGE`, not offboarding.
- Location changes route to People Ops, HRIS, Payroll, Benefits, Security, and Manager.

## Documentation and Deployment Help

Codex also helped:

- Document the exact MVP scope, constraints, limitations, and extension path.
- Explain local testing with Wrangler.
- Deploy the Worker to Cloudflare.
- Clarify why local development uses `heuristic-fallback` while deployed Workers can use Workers AI.

import { DurableObject } from "cloudflare:workers";
import {
  AuditRecord,
  buildRecommendation,
  Classification,
  classifyRequestHeuristically,
  retrievePolicies,
  toAuditRecord
} from "./peopleops";
import { auditClientScript, homeClientScript } from "./generated/client-assets";

export interface Env {
  AI?: Ai;
  PEOPLEOPS_STATE: DurableObjectNamespace<PeopleOpsState>;
}

type AiClassificationResponse = {
  requestType?: Classification["requestType"];
  confidence?: number;
  reason?: string;
};

export class PeopleOpsState extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/audit") {
      const records = await this.ctx.storage.list<AuditRecord>({ prefix: "audit:", reverse: true, limit: 100 });
      return json([...records.values()]);
    }

    if (request.method === "POST" && url.pathname === "/audit") {
      const record = (await request.json()) as AuditRecord;
      await this.ctx.storage.put(`audit:${record.createdAt}:${record.id}`, record);
      await this.ctx.storage.put(`session:${record.id}`, {
        request: record.request,
        requestType: record.requestType,
        status: record.status,
        createdAt: record.createdAt,
        routedTo: record.routedTo
      });
      return json(record, 201);
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/audit/")) {
      const id = url.pathname.split("/").pop();
      const records = await this.ctx.storage.list<AuditRecord>({ prefix: "audit:" });
      const match = [...records.entries()].find(([, record]) => record.id === id);

      if (!match) {
        return json({ error: "Audit record not found." }, 404);
      }

      const body = (await request.json()) as { status?: AuditRecord["status"]; reviewerNote?: string };
      const updated: AuditRecord = {
        ...match[1],
        status: body.status ?? match[1].status,
        reviewerNote: body.reviewerNote,
        reviewedAt: new Date().toISOString()
      };
      await this.ctx.storage.put(match[0], updated);
      return json(updated);
    }

    return json({ error: "Not found." }, 404);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return html(renderHome());
    }

    if (url.pathname === "/audit" && request.method === "GET") {
      return html(renderAuditPage());
    }

    if (url.pathname === "/assets/home.js" && request.method === "GET") {
      return javascript(homeClientScript);
    }

    if (url.pathname === "/assets/audit.js" && request.method === "GET") {
      return javascript(auditClientScript);
    }

    if (url.pathname === "/api/request" && request.method === "POST") {
      const body = (await request.json()) as { request?: string };
      const peopleOpsRequest = body.request?.trim();

      if (!peopleOpsRequest) {
        return json({ error: "Request text is required." }, 400);
      }

      const { classification, model } = await classifyRequest(peopleOpsRequest, env);
      const policies = retrievePolicies(peopleOpsRequest, classification.requestType);
      const recommendation = buildRecommendation(peopleOpsRequest, classification, policies);
      const auditRecord = toAuditRecord(peopleOpsRequest, classification, recommendation, policies, model);

      await getState(env).fetch(new Request("https://state/audit", { method: "POST", body: JSON.stringify(auditRecord) }));

      return json({ classification, policies, recommendation, auditRecord });
    }

    if (url.pathname === "/api/audit" && request.method === "GET") {
      return getState(env).fetch(new Request("https://state/audit"));
    }

    if (url.pathname.startsWith("/api/audit/") && request.method === "PATCH") {
      const id = url.pathname.split("/").pop();
      return getState(env).fetch(new Request(`https://state/audit/${id}`, { method: "PATCH", body: await request.text() }));
    }

    return html(renderHome(), 404);
  }
};

async function classifyRequest(request: string, env: Env): Promise<{ classification: Classification; model: string }> {
  if (!env.AI) {
    return { classification: classifyRequestHeuristically(request), model: "heuristic-fallback" };
  }

  try {
    const response = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      messages: [
        {
          role: "system",
          content:
            "Classify People Ops requests. Return compact JSON only with requestType, confidence, and reason. requestType must be one of POLICY_QUESTION, ONBOARDING, OFFBOARDING, MANAGER_CHANGE, LOCATION_CHANGE, BENEFITS, RECRUITING, ACCESS_REQUEST, UNKNOWN. Use LOCATION_CHANGE for permanent moves, relocation, cross-border employee location updates, payroll-country changes, benefits impact from a move, or location-related system access review. Do not use OFFBOARDING unless the request is about separation, termination, last day, deprovisioning, or an employee leaving the company."
        },
        { role: "user", content: request }
      ],
      response_format: { type: "json_object" }
    });

    const parsed = parseAiClassification(response);
    const fallback = classifyRequestHeuristically(request);

    return {
      classification: normalizeClassification(request, {
        requestType: parsed.requestType ?? fallback.requestType,
        confidence: clampConfidence(parsed.confidence ?? fallback.confidence),
        reason: parsed.reason ?? fallback.reason
      }),
      model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
    };
  } catch (error) {
    console.warn("Workers AI classification failed; using heuristic fallback.", error);
    return { classification: classifyRequestHeuristically(request), model: `heuristic-fallback: ${formatError(error)}` };
  }
}

function normalizeClassification(request: string, classification: Classification): Classification {
  const text = request.toLowerCase();
  const recruitingSignals = ["candidate", "recruiter", "recruiting", "offer", "interview"];
  const hasRecruitingSignal = recruitingSignals.some((signal) => text.includes(signal));
  const locationSignals = ["moving from", "move from", "relocat", "permanent", "permanently", "payroll", "benefits", "location"];
  const hasLocationSignal = locationSignals.some((signal) => text.includes(signal));
  const hasOffboardingSignal = ["offboard", "termination", "last day", "separation", "deprovision", "leaving the company"].some((signal) =>
    text.includes(signal)
  );

  if (hasRecruitingSignal && classification.requestType === "MANAGER_CHANGE") {
    return {
      requestType: "RECRUITING",
      confidence: Math.max(classification.confidence, 0.82),
      reason: "Recruiting, candidate, or offer language was stronger than the generic hiring-manager phrase."
    };
  }

  if (hasLocationSignal && !hasOffboardingSignal && classification.requestType === "OFFBOARDING") {
    return {
      requestType: "LOCATION_CHANGE",
      confidence: Math.max(classification.confidence, 0.84),
      reason: "Permanent move, location, payroll, benefits, or access-update language was stronger than offboarding language."
    };
  }

  return classification;
}

function parseAiClassification(response: unknown): AiClassificationResponse {
  if (typeof response === "object" && response !== null && "response" in response) {
    const text = (response as { response?: unknown }).response;
    if (typeof text === "string") {
      return parseClassificationJson(text);
    }
  }

  if (typeof response === "object" && response !== null) {
    return response as AiClassificationResponse;
  }

  return {};
}

function parseClassificationJson(text: string): AiClassificationResponse {
  try {
    return JSON.parse(text) as AiClassificationResponse;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return {};
    }

    try {
      return JSON.parse(match[0]) as AiClassificationResponse;
    } catch {
      return {};
    }
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 120);
  }

  return String(error).slice(0, 120);
}

function getState(env: Env): DurableObjectStub {
  return env.PEOPLEOPS_STATE.get(env.PEOPLEOPS_STATE.idFromName("global-peopleops-state"));
}

function clampConfidence(value: number): number {
  if (Number.isNaN(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function html(markup: string, status = 200): Response {
  return new Response(markup, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

function javascript(source: string): Response {
  return new Response(source, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function renderHome(): string {
  return page("PeopleOps AI Copilot", `<main class="shell">
    <section class="hero">
      <div>
        <p class="eyebrow">Cloudflare Workers + Durable Objects + Workers AI</p>
        <h1>PeopleOps AI Copilot</h1>
        <p class="lede">Route sensitive employee support and lifecycle requests with policy context, human review, and an audit trail.</p>
      </div>
      <a href="/audit" class="nav-link">View audit log</a>
    </section>

    <section class="workspace">
      <form id="request-form" class="composer">
        <label for="request">Ask PeopleOps Copilot</label>
        <textarea id="request" name="request" rows="8" placeholder="Describe a People Ops request..."></textarea>
        <button type="submit">Submit request</button>
      </form>

      <section id="result" class="result empty">
        <h2>Recommendation</h2>
        <p>Submit a People Ops request to see classification, policy retrieval, workflow routing, and review requirements.</p>
      </section>
    </section>
  </main>
  <script type="module" src="/assets/home.js"></script>`);
}

function renderAuditPage(): string {
  return page("Audit Log", `<main class="shell">
    <section class="hero compact">
      <div>
        <p class="eyebrow">Observable AI decisions</p>
        <h1>Audit Log</h1>
        <p class="lede">Each request stores classification, policy sources, risk, routing, review state, and model context.</p>
      </div>
      <a href="/" class="nav-link">New request</a>
    </section>
    <section id="audit-list" class="audit-list">Loading audit records...</section>
  </main>
  <script type="module" src="/assets/audit.js"></script>`);
}

function page(title: string, body: string): string {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${title}</title>
      <style>
        :root {
          color-scheme: light;
          --ink: #172033;
          --muted: #5b6476;
          --line: #d9deea;
          --surface: #ffffff;
          --soft: #f4f7fb;
          --brand: #f48120;
          --brand-dark: #b65309;
          --good: #1f7a4d;
          --warn: #a76000;
          --bad: #b42318;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background: var(--soft);
          color: var(--ink);
        }
        .shell { width: min(1120px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0; }
        .hero {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 24px;
          padding: 28px 0;
        }
        .hero.compact { padding-bottom: 18px; }
        .eyebrow { color: var(--brand-dark); font-weight: 700; margin: 0 0 10px; text-transform: uppercase; font-size: 0.78rem; letter-spacing: 0.06em; }
        h1 { font-size: clamp(2rem, 5vw, 4rem); line-height: 1; margin: 0; }
        h2 { margin: 0 0 8px; font-size: 1.4rem; }
        h3 { margin: 22px 0 8px; }
        .lede { max-width: 760px; color: var(--muted); font-size: 1.1rem; line-height: 1.6; margin: 14px 0 0; }
        .nav-link, button {
          border: 0;
          background: var(--brand);
          color: #111827;
          font-weight: 800;
          border-radius: 8px;
          padding: 12px 16px;
          text-decoration: none;
          cursor: pointer;
          white-space: nowrap;
        }
        button:disabled { cursor: wait; opacity: 0.72; }
        button.secondary {
          background: #eef2f7;
          color: var(--ink);
          border: 1px solid var(--line);
        }
        .workspace { display: grid; grid-template-columns: minmax(280px, 420px) 1fr; gap: 20px; align-items: start; }
        .composer, .result, .audit-card {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 12px 30px rgba(20, 32, 51, 0.06);
        }
        label { display: block; font-weight: 800; margin-bottom: 10px; }
        textarea {
          width: 100%;
          resize: vertical;
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 12px;
          font: inherit;
          line-height: 1.5;
          margin-bottom: 12px;
        }
        .result.empty { color: var(--muted); min-height: 260px; }
        .result-head, .audit-top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
        .result p, .audit-card p { line-height: 1.6; color: var(--muted); }
        .risk, .status {
          display: inline-flex;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 0.82rem;
          font-weight: 800;
          background: #eef2f7;
          color: var(--ink);
          white-space: nowrap;
        }
        .risk.low { background: #e8f6ef; color: var(--good); }
        .risk.medium { background: #fff4df; color: var(--warn); }
        .risk.high { background: #ffe9e7; color: var(--bad); }
        .facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 18px 0; }
        .facts div { border: 1px solid var(--line); border-radius: 8px; padding: 10px; }
        dt { color: var(--muted); font-size: 0.78rem; font-weight: 700; text-transform: uppercase; }
        dd { margin: 4px 0 0; font-weight: 700; overflow-wrap: anywhere; }
        li { margin: 6px 0; }
        .review-reason { border-left: 4px solid var(--brand); padding-left: 12px; }
        .review-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px; }
        .review-meta { font-weight: 700; }
        .audit-list { display: grid; gap: 14px; }
        time { color: var(--muted); font-size: 0.9rem; }
        .empty-state { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 20px; }
        .error { color: var(--bad); font-weight: 700; }
        @media (max-width: 820px) {
          .hero, .result-head, .audit-top { flex-direction: column; }
          .workspace, .facts { grid-template-columns: 1fr; }
          .nav-link { align-self: flex-start; }
        }
      </style>
    </head>
    <body>${body}</body>
  </html>`;
}

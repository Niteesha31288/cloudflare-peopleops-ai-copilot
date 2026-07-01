import type { RequestResponseDto } from "./types";

const form = document.querySelector("#request-form");
const result = document.querySelector("#result");

if (!(form instanceof HTMLFormElement) || !(result instanceof HTMLElement)) {
  throw new Error("PeopleOps request form or result panel is missing.");
}

const requestForm: HTMLFormElement = form;
const resultPanel: HTMLElement = result;

requestForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const request = new FormData(requestForm).get("request");
  resultPanel.className = "result";
  resultPanel.innerHTML = "<h2>Recommendation</h2><p>Analyzing request...</p>";

  try {
    const response = await fetch("/api/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request })
    });
    const data = (await response.json()) as RequestResponseDto | { error?: string };

    if (!response.ok) {
      renderError("error" in data && data.error ? data.error : "Something went wrong.");
      return;
    }

    renderRecommendation(data as RequestResponseDto);
  } catch {
    renderError("Unable to reach the PeopleOps Copilot API.");
  }
});

function renderRecommendation(data: RequestResponseDto): void {
  const { recommendation: rec, auditRecord } = data;
  const missingInformation = rec.missingInformation.length
    ? rec.missingInformation.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>None detected</li>";

  resultPanel.innerHTML = `
    <div class="result-head">
      <div>
        <h2>${formatLabel(rec.requestType)}</h2>
        <p>${escapeHtml(rec.answer)}</p>
      </div>
      <span class="risk ${escapeHtml(rec.riskLevel)}">${escapeHtml(rec.riskLevel)} risk</span>
    </div>
    <dl class="facts">
      <div><dt>Human review</dt><dd>${rec.humanReviewRequired ? "Required" : "Not required"}</dd></div>
      <div><dt>Routed to</dt><dd>${escapeHtml(rec.routedTo.join(", "))}</dd></div>
      <div><dt>Sources</dt><dd>${escapeHtml(auditRecord.policySources.join(", ") || "None")}</dd></div>
      <div><dt>Status</dt><dd>${formatLabel(auditRecord.status)}</dd></div>
    </dl>
    <h3>Missing information</h3>
    <ul>${missingInformation}</ul>
    <h3>Workflow</h3>
    <ol>${rec.workflowSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
    <p class="review-reason">${escapeHtml(rec.reviewReason)}</p>
  `;
}

function renderError(message: string): void {
  resultPanel.innerHTML = `<h2>Recommendation</h2><p class="error">${escapeHtml(message)}</p>`;
}

function formatLabel(value: string): string {
  return escapeHtml(value.replaceAll("_", " "));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

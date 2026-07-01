import type { AuditRecordDto, ReviewStatus } from "./types";

const list = document.querySelector("#audit-list");

if (!(list instanceof HTMLElement)) {
  throw new Error("Audit list container is missing.");
}

const auditList: HTMLElement = list;

void loadAudit();

auditList.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLButtonElement) || !target.dataset.reviewAction || !target.dataset.recordId) {
    return;
  }

  const status = target.dataset.reviewAction as ReviewStatus;
  void updateReviewStatus(target.dataset.recordId, status, target);
});

async function loadAudit(): Promise<void> {
  try {
    const response = await fetch("/api/audit");
    const records = (await response.json()) as AuditRecordDto[];

    if (!response.ok) {
      renderMessage("Unable to load audit records.", true);
      return;
    }

    if (!records.length) {
      renderMessage("No audit records yet.");
      return;
    }

    auditList.innerHTML = records.map(renderAuditRecord).join("");
  } catch {
    renderMessage("Unable to reach the audit API.", true);
  }
}

function renderAuditRecord(record: AuditRecordDto): string {
  const reviewActions =
    record.status === "pending_review"
      ? `
        <div class="review-actions" aria-label="Human review actions">
          <button class="secondary" type="button" data-review-action="approved" data-record-id="${escapeHtml(record.id)}">Approve</button>
          <button class="secondary" type="button" data-review-action="rejected" data-record-id="${escapeHtml(record.id)}">Reject</button>
          <button class="secondary" type="button" data-review-action="completed" data-record-id="${escapeHtml(record.id)}">Mark complete</button>
        </div>
      `
      : `<p class="review-meta">Reviewed ${record.reviewedAt ? escapeHtml(new Date(record.reviewedAt).toLocaleString()) : "previously"}${record.reviewerNote ? `: ${escapeHtml(record.reviewerNote)}` : ""}</p>`;

  return `
    <article class="audit-card">
      <div class="audit-top">
        <div>
          <h2>${formatLabel(record.requestType)}</h2>
          <time>${escapeHtml(new Date(record.createdAt).toLocaleString())}</time>
        </div>
        <span class="status">${formatLabel(record.status)}</span>
      </div>
      <p>${escapeHtml(record.request)}</p>
      <dl class="facts">
        <div><dt>Risk</dt><dd>${escapeHtml(record.riskLevel)}</dd></div>
        <div><dt>Routed to</dt><dd>${escapeHtml(record.routedTo.join(", "))}</dd></div>
        <div><dt>Sources</dt><dd>${escapeHtml(record.policySources.join(", ") || "None")}</dd></div>
        <div><dt>Model</dt><dd>${escapeHtml(record.model)}</dd></div>
      </dl>
      <p class="review-reason">${escapeHtml(record.classificationReason)} ${escapeHtml(record.reviewReason)}</p>
      ${reviewActions}
    </article>
  `;
}

async function updateReviewStatus(recordId: string, status: ReviewStatus, button: HTMLButtonElement): Promise<void> {
  const previousText = button.textContent ?? "Updating";
  button.disabled = true;
  button.textContent = "Updating...";

  try {
    const response = await fetch(`/api/audit/${encodeURIComponent(recordId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status,
        reviewerNote: reviewNoteFor(status)
      })
    });

    if (!response.ok) {
      button.textContent = "Try again";
      return;
    }

    await loadAudit();
  } catch {
    button.textContent = "Try again";
  } finally {
    button.disabled = false;
    if (button.textContent === "Updating...") {
      button.textContent = previousText;
    }
  }
}

function reviewNoteFor(status: ReviewStatus): string {
  switch (status) {
    case "approved":
      return "Human reviewer approved the recommended workflow for downstream action.";
    case "rejected":
      return "Human reviewer rejected the recommendation; no sensitive action should proceed.";
    case "completed":
      return "Human reviewer marked the workflow complete after required checks.";
    default:
      return "Awaiting human review.";
  }
}

function renderMessage(message: string, isError = false): void {
  auditList.innerHTML = `<p class="empty-state${isError ? " error" : ""}">${escapeHtml(message)}</p>`;
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

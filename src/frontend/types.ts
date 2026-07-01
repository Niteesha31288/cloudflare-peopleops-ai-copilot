export type RiskLevel = "low" | "medium" | "high";
export type ReviewStatus = "pending_review" | "approved" | "rejected" | "completed";

export type RecommendationDto = {
  requestType: string;
  riskLevel: RiskLevel;
  routedTo: string[];
  missingInformation: string[];
  workflowSteps: string[];
  humanReviewRequired: boolean;
  reviewReason: string;
  answer: string;
};

export type AuditRecordDto = RecommendationDto & {
  id: string;
  request: string;
  classificationReason: string;
  policySources: string[];
  model: string;
  status: ReviewStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewerNote?: string;
};

export type RequestResponseDto = {
  recommendation: RecommendationDto;
  auditRecord: AuditRecordDto;
};

export type RequestType =
  | "POLICY_QUESTION"
  | "ONBOARDING"
  | "OFFBOARDING"
  | "MANAGER_CHANGE"
  | "LOCATION_CHANGE"
  | "BENEFITS"
  | "RECRUITING"
  | "ACCESS_REQUEST"
  | "UNKNOWN";

export type RiskLevel = "low" | "medium" | "high";

export type PolicyDocument = {
  id: string;
  title: string;
  filename: string;
  text: string;
  keywords: string[];
};

export type Classification = {
  requestType: RequestType;
  confidence: number;
  reason: string;
};

export type Recommendation = {
  requestType: RequestType;
  riskLevel: RiskLevel;
  routedTo: string[];
  missingInformation: string[];
  workflowSteps: string[];
  humanReviewRequired: boolean;
  reviewReason: string;
  answer: string;
};

export type AuditRecord = Recommendation & {
  id: string;
  request: string;
  classificationReason: string;
  policySources: string[];
  model: string;
  status: "pending_review" | "approved" | "rejected" | "completed";
  createdAt: string;
  reviewedAt?: string;
  reviewerNote?: string;
};

export const POLICY_DOCUMENTS: PolicyDocument[] = [
  {
    id: "remote-work",
    title: "Remote Work and Temporary International Work",
    filename: "remote-work-policy.md",
    keywords: ["remote", "country", "international", "india", "travel", "work from", "location"],
    text:
      "Temporary remote work from another country requires People Ops review before travel, manager approval, and checks for immigration, payroll, tax, security, and data access constraints. Employees should provide destination, dates, business reason, employee location, and whether customer or employee data will be accessed."
  },
  {
    id: "onboarding",
    title: "New Hire Onboarding",
    filename: "onboarding-policy.md",
    keywords: ["onboard", "onboarding", "new employee", "joining", "start date", "equipment", "new hire"],
    text:
      "Onboarding workflows require verified employee identity, role, team, manager, start date, work location, equipment needs, and access profile. HR validates the employee record, the manager confirms business details, IT provisions accounts and devices, Security reviews access, and People Ops sends the onboarding packet."
  },
  {
    id: "offboarding",
    title: "Employee Offboarding",
    filename: "offboarding-policy.md",
    keywords: ["offboard", "termination", "leaving", "last day", "separation", "deprovision"],
    text:
      "Offboarding is high sensitivity. People Ops confirms last day and separation type, Legal reviews special cases, IT schedules deprovisioning, Security reviews retained access and device return, Payroll confirms final pay requirements, and all steps require human approval before action."
  },
  {
    id: "access-review",
    title: "Access Review and Lifecycle Changes",
    filename: "access-review-policy.md",
    keywords: ["access", "permission", "system", "account", "manager change", "moving teams", "transfer"],
    text:
      "Access changes require least-privilege review, manager approval, system owner approval for sensitive tools, and Security review when privileged access, production systems, or employee data are involved. Manager changes and team transfers must update reporting data before access is modified."
  },
  {
    id: "benefits",
    title: "Benefits Support Routing",
    filename: "benefits-policy.md",
    keywords: ["benefit", "benefits", "health", "medical", "leave", "insurance", "401k"],
    text:
      "Benefits questions are routed to People Ops Benefits. The copilot may summarize general policy but should avoid collecting unnecessary health or dependent data. Cases involving protected health information, leave accommodations, or payroll deductions require human review."
  },
  {
    id: "recruiting",
    title: "Recruiting Coordination",
    filename: "recruiting-policy.md",
    keywords: ["candidate", "interview", "recruit", "recruiting", "offer", "hiring"],
    text:
      "Recruiting operations requests are routed to Recruiting and the hiring manager. Offer, compensation, interview feedback, and candidate data changes require human review and should be logged with source context and approval status."
  }
];

const ROUTES: Record<RequestType, string[]> = {
  POLICY_QUESTION: ["People Ops"],
  ONBOARDING: ["HR", "IT", "Security", "Manager"],
  OFFBOARDING: ["People Ops", "IT", "Security", "Legal", "Payroll"],
  MANAGER_CHANGE: ["HRIS", "Manager", "People Ops", "Security"],
  LOCATION_CHANGE: ["People Ops", "HRIS", "Payroll", "Benefits", "Security", "Manager"],
  BENEFITS: ["Benefits"],
  RECRUITING: ["Recruiting", "Hiring Manager"],
  ACCESS_REQUEST: ["IT", "Security", "Manager"],
  UNKNOWN: ["People Ops Triage"]
};

export function classifyRequestHeuristically(request: string): Classification {
  const text = request.toLowerCase();
  const checks: Array<[RequestType, string[], string]> = [
    ["OFFBOARDING", ["offboard", "termination", "leaving", "last day", "separation", "deprovision"], "Offboarding or separation language was detected."],
    ["ONBOARDING", ["onboard", "new hire", "new employee", "joining", "start date", "equipment"], "New hire onboarding language was detected."],
    ["RECRUITING", ["candidate", "interview", "recruit", "recruiting", "offer", "hiring"], "Recruiting, candidate, or offer language was detected."],
    ["LOCATION_CHANGE", ["moving from", "move from", "relocat", "permanently", "location", "payroll", "benefits"], "Employee location, payroll, benefits, or cross-border lifecycle-change language was detected."],
    ["MANAGER_CHANGE", ["manager change", "new manager", "update manager", "reporting line", "moving teams", "transfer"], "Reporting-line or team-transfer language was detected."],
    ["ACCESS_REQUEST", ["access", "permission", "account", "provision", "production", "system"], "Access or provisioning language was detected."],
    ["BENEFITS", ["benefit", "medical", "health", "leave", "insurance", "401k"], "Benefits or leave language was detected."],
    ["POLICY_QUESTION", ["policy", "can i", "am i allowed", "work remotely", "remote", "another country"], "The request asks for policy guidance."]
  ];

  for (const [requestType, keywords, reason] of checks) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      return { requestType, confidence: 0.78, reason };
    }
  }

  return {
    requestType: "UNKNOWN",
    confidence: 0.35,
    reason: "No strong policy, lifecycle, benefits, recruiting, or access signal was detected."
  };
}

export function retrievePolicies(request: string, requestType: RequestType): PolicyDocument[] {
  const text = request.toLowerCase();
  const scored = POLICY_DOCUMENTS.map((doc) => {
    const keywordScore = doc.keywords.reduce((score, keyword) => score + (text.includes(keyword) ? 2 : 0), 0);
    const typeScore =
      (requestType === "ONBOARDING" && doc.id === "onboarding") ||
      (requestType === "OFFBOARDING" && doc.id === "offboarding") ||
      (requestType === "MANAGER_CHANGE" && doc.id === "access-review") ||
      (requestType === "LOCATION_CHANGE" && ["remote-work", "benefits", "access-review"].includes(doc.id)) ||
      (requestType === "ACCESS_REQUEST" && doc.id === "access-review") ||
      (requestType === "BENEFITS" && doc.id === "benefits") ||
      (requestType === "RECRUITING" && doc.id === "recruiting") ||
      (requestType === "POLICY_QUESTION" && doc.id === "remote-work")
        ? 3
        : 0;
    return { doc, score: keywordScore + typeScore };
  });

  return scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ doc }) => doc);
}

export function evaluateRisk(requestType: RequestType, request: string): { riskLevel: RiskLevel; humanReviewRequired: boolean; reviewReason: string } {
  const text = request.toLowerCase();
  const sensitiveSignals = ["employee", "access", "manager", "health", "medical", "payroll", "termination", "country", "visa", "production"];

  if (requestType === "OFFBOARDING" || text.includes("termination") || text.includes("deprovision")) {
    return {
      riskLevel: "high",
      humanReviewRequired: true,
      reviewReason: "Offboarding and deprovisioning can affect employment records, access, payroll, and legal obligations."
    };
  }

  if (requestType === "RECRUITING") {
    return {
      riskLevel: text.includes("offer") || text.includes("compensation") || text.includes("candidate") ? "medium" : "low",
      humanReviewRequired: true,
      reviewReason: "Recruiting requests can involve candidate data, offer details, compensation, or interview feedback and require human review before changes."
    };
  }

  if (requestType === "LOCATION_CHANGE") {
    return {
      riskLevel: "medium",
      humanReviewRequired: true,
      reviewReason: "Permanent location changes can affect employee records, payroll, benefits eligibility, tax, manager approvals, and access controls."
    };
  }

  if (["ONBOARDING", "MANAGER_CHANGE", "ACCESS_REQUEST"].includes(requestType) || sensitiveSignals.some((signal) => text.includes(signal))) {
    return {
      riskLevel: "medium",
      humanReviewRequired: true,
      reviewReason: "Employee lifecycle or access-related workflows require approval before any system or record changes."
    };
  }

  if (requestType === "BENEFITS") {
    return {
      riskLevel: "medium",
      humanReviewRequired: true,
      reviewReason: "Benefits requests can involve sensitive personal, payroll, or health-adjacent information."
    };
  }

  return {
    riskLevel: requestType === "UNKNOWN" ? "medium" : "low",
    humanReviewRequired: requestType === "UNKNOWN",
    reviewReason: requestType === "UNKNOWN" ? "Unknown requests should be triaged by People Ops before action." : "General policy guidance can be answered without taking action."
  };
}

export function buildRecommendation(request: string, classification: Classification, policies: PolicyDocument[]): Recommendation {
  const risk = evaluateRisk(classification.requestType, request);
  const requestType = classification.requestType;
  const missingInformation = missingInfoFor(requestType, request);
  const workflowSteps = workflowFor(requestType);
  const policyNames = policies.map((policy) => policy.title).join(", ") || "the synthetic People Ops policy set";

  return {
    requestType,
    riskLevel: risk.riskLevel,
    routedTo: ROUTES[requestType],
    missingInformation,
    workflowSteps,
    humanReviewRequired: risk.humanReviewRequired,
    reviewReason: risk.reviewReason,
    answer: [
      `I classified this as ${requestType.replace("_", " ").toLowerCase()} and retrieved ${policyNames}.`,
      risk.humanReviewRequired
        ? "I can prepare the workflow and recommendation, but a human reviewer must approve before sensitive employee records, access, payroll, or lifecycle systems are changed."
        : "This appears safe for policy self-service because it does not request a system or employee-record change.",
      policies[0] ? `Relevant policy guidance: ${policies[0].text}` : "No exact policy source matched, so this should go to People Ops triage."
    ].join(" ")
  };
}

function missingInfoFor(requestType: RequestType, request: string): string[] {
  const text = request.toLowerCase();
  const checks: Array<[string, string[]]> = [
    ["employee email", ["@", "email"]],
    ["start date or effective date", ["start date", "next monday", "effective", "last day"]],
    ["manager approval", ["manager approved", "manager approval", "approved by manager"]],
    ["work location", ["location", "remote", "country", "office"]],
    ["access or equipment needs", ["access", "equipment", "laptop", "system"]]
  ];

  if (requestType === "POLICY_QUESTION") {
    return ["employee location", "requested dates", "manager approval status", "whether employee or customer data will be accessed"].filter(
      (item) => !text.includes(item.split(" ")[0])
    );
  }

  if (requestType === "BENEFITS") {
    return ["benefit category", "country or work location", "effective date"].filter((item) => !text.includes(item.split(" ")[0]));
  }

  if (requestType === "RECRUITING") {
    return ["candidate identifier", "requisition or role level", "offer fields to change", "hiring manager approval"].filter(
      (item) => !text.includes(item.split(" ")[0])
    );
  }

  if (requestType === "LOCATION_CHANGE") {
    return ["employee email", "effective move date", "new work location", "manager approval", "payroll country", "benefits impact", "systems or access impact"].filter(
      (item) => !text.includes(item.split(" ")[0])
    );
  }

  if (requestType === "UNKNOWN") {
    return ["request owner", "employee identifier", "desired outcome", "deadline"];
  }

  return checks.filter(([, signals]) => !signals.some((signal) => text.includes(signal))).map(([label]) => label);
}

function workflowFor(requestType: RequestType): string[] {
  switch (requestType) {
    case "ONBOARDING":
      return [
        "HR verifies employee record and start details",
        "Manager confirms role, team, start date, and access profile",
        "IT provisions accounts and equipment",
        "Security reviews requested access level",
        "People Ops sends onboarding packet after approval"
      ];
    case "OFFBOARDING":
      return [
        "People Ops confirms last day and separation type",
        "Legal reviews special handling requirements",
        "IT schedules account deprovisioning",
        "Security validates access removal and device return",
        "Payroll confirms final pay workflow"
      ];
    case "MANAGER_CHANGE":
      return [
        "HRIS validates current and future reporting line",
        "Current and future managers approve the change",
        "People Ops updates employee record after approval",
        "Security reviews downstream access impact"
      ];
    case "LOCATION_CHANGE":
      return [
        "People Ops validates the permanent location-change request and effective date",
        "Manager confirms business approval and work arrangement",
        "HRIS updates employee location after approval",
        "Payroll reviews tax, payroll country, and local compliance impact",
        "Benefits reviews eligibility or plan changes",
        "Security reviews access impact for the new location"
      ];
    case "ACCESS_REQUEST":
      return [
        "Manager confirms business need",
        "System owner reviews least-privilege access",
        "Security reviews sensitive or privileged access",
        "IT provisions only after approval"
      ];
    case "BENEFITS":
      return [
        "Benefits team reviews the question",
        "People Ops avoids unnecessary personal data collection",
        "Special cases are routed for human review",
        "Final guidance is logged in the audit trail"
      ];
    case "RECRUITING":
      return [
        "Recruiting validates candidate or requisition context",
        "Hiring manager reviews requested action",
        "Offer or feedback changes are approved by a human",
        "Decision and source context are logged"
      ];
    case "POLICY_QUESTION":
      return [
        "Retrieve relevant People Ops policy",
        "Summarize general guidance",
        "Flag missing details and review triggers",
        "Route to People Ops if action or exception is requested"
      ];
    default:
      return ["Route to People Ops triage", "Collect required context", "Classify after human review"];
  }
}

export function toAuditRecord(
  request: string,
  classification: Classification,
  recommendation: Recommendation,
  policies: PolicyDocument[],
  model: string
): AuditRecord {
  return {
    id: crypto.randomUUID(),
    request,
    classificationReason: classification.reason,
    policySources: policies.map((policy) => policy.filename),
    model,
    status: recommendation.humanReviewRequired ? "pending_review" : "completed",
    createdAt: new Date().toISOString(),
    ...recommendation
  };
}

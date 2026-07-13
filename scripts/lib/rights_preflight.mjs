const RESTRICTION_RULES = [
  {
    id: "generative-ai-ingestion",
    summary: "Source notice restricts training or ingestion into LLM/generative-AI systems.",
    patterns: [
      /may\s+not\s+be\s+used[\s\S]{0,180}(?:training|ingest(?:ed|ion)?)[\s\S]{0,180}(?:large\s+language\s+models?|generative\s+AI)[\s\S]{0,120}(?:without|unless)[\s\S]{0,80}permission/i,
      /may\s+not\s+be\s+(?:ingested|used)[\s\S]{0,180}(?:large\s+language\s+models?|generative\s+AI)[\s\S]{0,120}(?:without|unless)[\s\S]{0,80}permission/i,
      /(?:no|prohibit(?:ed|s)?|forbid(?:den|s)?)[\s\S]{0,100}(?:AI|artificial\s+intelligence|large\s+language\s+model)[\s\S]{0,120}(?:training|ingest|use)/i,
    ],
  },
  {
    id: "automated-processing-restriction",
    summary: "Source notice restricts automated, machine-learning, or text/data-mining processing.",
    patterns: [
      /(?:may\s+not|prohibit(?:ed|s)?|forbid(?:den|s)?)[\s\S]{0,100}(?:automated\s+processing|machine\s+learning|text\s+and\s+data\s+mining|text\s+or\s+data\s+mining)/i,
    ],
  },
];

function excerpt(text, index, length = 320) {
  const start = Math.max(0, index - 60);
  return String(text).slice(start, start + length).replace(/\s+/g, " ").trim();
}

export function scanProcessRestrictions(text) {
  const notices = [];
  for (const rule of RESTRICTION_RULES) {
    for (const pattern of rule.patterns) {
      const match = pattern.exec(String(text));
      if (match) {
        notices.push({ id: rule.id, summary: rule.summary, excerpt: excerpt(text, match.index) });
        break;
      }
    }
  }
  return notices;
}

export function processDecisionResolves(notices, decision) {
  if (!notices.length) return true;
  return decision?.status === "permitted" &&
    ["permission", "qualified-review"].includes(decision?.basis) &&
    typeof decision?.decidedBy === "string" && decision.decidedBy.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(decision?.decidedAt || "") &&
    typeof decision?.reference === "string" && decision.reference.trim().length > 0 &&
    typeof decision?.rationale === "string" && decision.rationale.trim().length >= 30;
}

export function makeProcessReview(text, scannedAt = new Date().toISOString()) {
  const notices = scanProcessRestrictions(text);
  return {
    schemaVersion: 1,
    scannedAt,
    status: notices.length ? "blocked-pending-decision" : "no-restriction-detected",
    notices,
  };
}

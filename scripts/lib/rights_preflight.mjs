const RESTRICTION_RULES = [
  {
    id: "generative-ai-ingestion",
    summary: "Source notice restricts training or ingestion into LLM/generative-AI systems.",
    patterns: [
      /\bmay\s+not\s+be\s+used\b[\s\S]{0,180}\b(?:training|ingest(?:ed|ion)?)\b[\s\S]{0,180}\b(?:large\s+language\s+models?|generative\s+AI)\b[\s\S]{0,120}\b(?:without|unless)\b[\s\S]{0,80}\bpermission\b/i,
      /\bmay\s+not\s+be\s+(?:ingested|used)\b[\s\S]{0,180}\b(?:large\s+language\s+models?|generative\s+AI)\b[\s\S]{0,120}\b(?:without|unless)\b[\s\S]{0,80}\bpermission\b/i,
      /\b(?:no|prohibit(?:ed|s)?|forbid(?:den|s)?)\b[\s\S]{0,100}\b(?:AI|artificial\s+intelligence|large\s+language\s+model)\b[\s\S]{0,120}\b(?:training|ingest(?:ed|ion)?|use)\b/i,
    ],
  },
  {
    id: "automated-processing-restriction",
    summary: "Source notice restricts automated, machine-learning, or text/data-mining processing.",
    patterns: [
      /\b(?:may\s+not|prohibit(?:ed|s)?|forbid(?:den|s)?)\b[\s\S]{0,100}\b(?:automated\s+processing|machine\s+learning|text\s+and\s+data\s+mining|text\s+or\s+data\s+mining)\b/i,
    ],
  },
];

const HTML_ENTITIES = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export function normalizeEvidenceText(value) {
  return String(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity) => {
      if (entity[0] === "#") {
        const hex = entity[1]?.toLowerCase() === "x";
        const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
        return Number.isFinite(point) ? String.fromCodePoint(point) : " ";
      }
      return HTML_ENTITIES[entity.toLowerCase()] ?? " ";
    })
    .replace(/\s+/g, " ")
    .trim();
}

function excerpt(text, index, length = 320) {
  const start = Math.max(0, index - 60);
  return String(text).slice(start, start + length).replace(/\s+/g, " ").trim();
}

export function scanProcessRestrictions(text) {
  const visibleText = normalizeEvidenceText(text);
  const notices = [];
  for (const rule of RESTRICTION_RULES) {
    for (const pattern of rule.patterns) {
      const match = pattern.exec(visibleText);
      if (match) {
        notices.push({ id: rule.id, summary: rule.summary, excerpt: excerpt(visibleText, match.index) });
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

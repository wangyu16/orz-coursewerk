const RESTRICTION_RULES = [
  {
    id: "generative-ai-ingestion",
    summary: "Source contains a notice addressing training or ingestion into LLM/generative-AI systems.",
    patterns: [
      /\bmay\s+not\s+be\s+used\b[\s\S]{0,180}\b(?:training|ingest(?:ed|ion)?)\b[\s\S]{0,180}\b(?:large\s+language\s+models?|generative\s+AI)\b[\s\S]{0,120}\b(?:without|unless)\b[\s\S]{0,80}\bpermission\b/i,
      /\bmay\s+not\s+be\s+(?:ingested|used)\b[\s\S]{0,180}\b(?:large\s+language\s+models?|generative\s+AI)\b[\s\S]{0,120}\b(?:without|unless)\b[\s\S]{0,80}\bpermission\b/i,
      /\b(?:no|prohibit(?:ed|s)?|forbid(?:den|s)?)\b[\s\S]{0,100}\b(?:AI|artificial\s+intelligence|large\s+language\s+model)\b[\s\S]{0,120}\b(?:training|ingest(?:ed|ion)?|use)\b/i,
    ],
  },
  {
    id: "automated-processing-restriction",
    summary: "Source contains a notice addressing automated, machine-learning, or text/data-mining processing.",
    patterns: [
      /\b(?:train(?:ing)?|fine-?tun(?:e|ing)|evaluat(?:e|ing))\b[\s\S]{0,160}\b(?:artificial\s+intelligence|AI|machine\s+learning|language\s+models?)\b[\s\S]{0,160}\b(?:not\s+permitted|prohibited|forbidden|reserved|must\s+not)\b/i,
      /\b(?:must\s+not|may\s+not|do\s+not)\b[\s\S]{0,80}\b(?:AI|artificial\s+intelligence|machine\s+learning)\s+training\b/i,
      /\b(?:TDM|text\s+and\s+data\s+mining)\s+(?:reservation|rights?\s+reserved|opt-?out)\b/i,
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
    .replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, "") // soft hyphens / zero-width joiners split "train­ing" (L4)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    // Round-4 audit: text a browser never shows is not visible evidence either.
    .replace(/<(?:noscript|template)\b[\s\S]*?<\/(?:noscript|template)>/gi, " ")
    .replace(/<(\w+)\b[^>]*(?:\bhidden\b|aria-hidden\s*=\s*["']?true|display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
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

export function makeProcessReview(text, scannedAt = new Date().toISOString()) {
  const notices = scanProcessRestrictions(text);
  return {
    schemaVersion: 1,
    scannedAt,
    status: notices.length ? "notice-recorded" : "no-notice-detected",
    legalEffectDetermined: false,
    notices,
  };
}

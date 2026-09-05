// ONE identity check for every "who is accountable" field (M1, round-3 audit): the public author,
// the human visual reviewer, the media-decision reviewer. Three regexes had drifted apart and all
// of them accepted "Your Name", "Jane Doe", "Anonymous", "N/A", and the vendor names of the very
// models that may not be the accountable author ("Claude", "ChatGPT", "Gemini").
const PLACEHOLDER = /\b(?:replace(?:-with)?|placeholder|temporary|trial maintainer|pending|unassigned|tbd|todo|unknown|fixme|changeme|insert(?: name)?(?: here)?|your name|author name|reviewer name|sample|example|lorem|ipsum|anonymous|n\/a|none|null|undefined|doe)\b/i;
const MACHINE = /\b(?:coursewerk|agent|language model|llm|claude|chatgpt|gpt-?\d[\w.-]*|gemini|copilot|openai|anthropic|llama|mistral|deepseek|bard|assistant)\b/i;
/**
 * @param {string} name
 * @returns {string|null} a reason the name is not an accountable identity, or null when it may be
 */
export function identityProblem(name) {
  const s = String(name ?? "").trim();
  if (!s) return "is empty";
  if (/^[<[{(].*[>\]})]$/.test(s)) return "is a template token";
  if (PLACEHOLDER.test(s)) return "is a placeholder";
  if (MACHINE.test(s)) return "names an AI system or tool, which cannot be the accountable person or institution";
  const letters = (s.match(/\p{L}/gu) || []).length;
  if (letters < 4) return "is too short to identify a person or institution";
  return null;
}

import { projects } from "./projects.mjs";
import { skillTerms } from "./skills.mjs";

const specificSkills = [
  { name: "SQL", pattern: /\bsql\b/i, projectIds: ["community-sql-report", "sql-food-pantry"] },
  { name: "Excel", pattern: /\bexcel\b/i, projectIds: ["food-pantry-budget", "signup-sheet", "spreadsheet-rota"] },
  { name: "Spreadsheets", pattern: /\bspreadsheet\w*\b|\bgoogle sheets\b/i, projectIds: ["signup-sheet", "food-pantry-budget", "spreadsheet-rota"] },
  { name: "Databases", pattern: /\bdatabase\w*\b/i, projectIds: ["volunteer-database", "database-resource-list", "community-sql-report"] },
  { name: "Customer service", pattern: /\bcustomer service\b/i, projectIds: ["welcome-desk", "tech-help-hour", "service-faq"] },
  { name: "Python", pattern: /\bpython\b/i, projectIds: ["python-donations", "python-event-counts"] },
  { name: "JavaScript", pattern: /\bjavascript\b/i, projectIds: ["javascript-event-page", "javascript-resource-finder"] },
];

function postingContext(posting, pattern) {
  const index = posting.search(pattern);
  if (index < 0) return "";
  const start = Math.max(0, index - 75);
  const end = Math.min(posting.length, index + 100);
  return `${start ? "…" : ""}${posting.slice(start, end).replace(/\s+/g, " ").trim()}${end < posting.length ? "…" : ""}`;
}

// Credentials passed here must already have been verified against the demo issuer key.
export function buildStudentPathway(posting, validCredentials, catalog = projects) {
  const evidence = validCredentials.flatMap(({ index, payload, sharedUrl }) =>
    payload.mappings.map(({ skill, quote }) => ({ skill, quote, index, sharedUrl })),
  );
  const catalogById = new Map(catalog.map((project) => [project.id, project]));
  const definitions = [
    ...specificSkills.map((item) => ({
      ...item,
      evidence: (itemEvidence) => item.pattern.test(itemEvidence.quote),
      suggestions: () => item.projectIds.map((id) => catalogById.get(id)).filter(Boolean),
    })),
    ...Object.entries(skillTerms).map(([name, pattern]) => ({
      name,
      pattern: name === "Digital" ? /\b(digital|technology|technical|computer\w*|software)\b/i : pattern,
      evidence: (itemEvidence) => itemEvidence.skill === name,
      suggestions: () => catalog.filter((project) => project.skills.includes(name)),
    })),
  ];
  return definitions
    .filter(({ pattern }) => pattern.test(posting))
    .map(({ name, pattern, evidence: matches, suggestions }) => ({
      name,
      context: postingContext(posting, pattern),
      evidence: evidence.filter(matches).slice(0, 3),
      projects: suggestions(),
    }));
}

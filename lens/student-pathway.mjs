import { projects } from "./projects.mjs";
import { skillTerms } from "./skills.mjs";

const specificSkills = [
  { name: "SQL", pattern: /\bsql\b/i, projectIds: ["community-sql-report"] },
  { name: "Excel", pattern: /\bexcel\b/i, projectIds: ["food-pantry-budget", "signup-sheet"] },
  { name: "Spreadsheets", pattern: /\bspreadsheet\w*\b|\bgoogle sheets\b/i, projectIds: ["signup-sheet", "food-pantry-budget"] },
  { name: "Databases", pattern: /\bdatabase\w*\b/i, projectIds: ["volunteer-database"] },
  { name: "Customer service", pattern: /\bcustomer service\b/i, projectIds: ["welcome-desk", "tech-help-hour"] },
  { name: "Python", pattern: /\bpython\b/i, projectIds: [] },
  { name: "JavaScript", pattern: /\bjavascript\b/i, projectIds: [] },
];

function postingContext(posting, pattern) {
  const index = posting.search(pattern);
  if (index < 0) return "";
  const start = Math.max(0, index - 75);
  const end = Math.min(posting.length, index + 100);
  return `${start ? "…" : ""}${posting.slice(start, end).replace(/\s+/g, " ").trim()}${end < posting.length ? "…" : ""}`;
}

// Credentials passed here must already have been verified against the browser's issuer key.
export function buildStudentPathway(posting, validCredentials, catalog = projects) {
  const evidence = validCredentials.flatMap(({ index, payload }) =>
    payload.mappings.map(({ skill, quote }) => ({ skill, quote, index })),
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
      projects: suggestions().slice(0, 2),
    }));
}

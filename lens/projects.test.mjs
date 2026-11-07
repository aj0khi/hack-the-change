import test from "node:test";
import assert from "node:assert/strict";
import { projects, keywordProjectSuggestions } from "./projects.mjs";
import { skillTerms } from "./skills.mjs";
import { buildPrompt, groundRequirements } from "./lens.mjs";

test("fictional project catalog covers every Skills for Success category", () => {
  assert.equal(new Set(projects.map((project) => project.id)).size, projects.length);
  assert.equal(new Set(projects.map((project) => project.title)).size, projects.length);
  for (const project of projects) {
    assert.match(project.organization, /example/i);
    assert.ok(project.description && project.time && project.skills.length);
    for (const skill of project.skills) assert.ok(skill in skillTerms, skill);
  }
  for (const skill of Object.keys(skillTerms)) {
    assert.ok(projects.some((project) => project.skills.includes(skill)), skill);
  }
});

test("SQL gaps point to a project that explicitly practises SQL", () => {
  const suggestions = keywordProjectSuggestions("Basic SQL or database experience");
  assert.deepEqual(suggestions.map((project) => project.id), ["community-sql-report"]);
  assert.match(suggestions[0].description, /\bSQL\b/);
  assert.equal(keywordProjectSuggestions("Excellent communication"), null);
});

test("new projects are available to the model and grounded suggestions", () => {
  const prompt = buildPrompt("SQL and budgeting", []);
  assert.match(prompt, /\[projectId: community-sql-report\]/);
  assert.match(prompt, /\[projectId: food-pantry-budget\]/);
  const { requirements } = groundRequirements([
    { text: "SQL", kind: "technical", matches: [], suggestedProjects: [{ projectId: "community-sql-report", why: "Practise SQL queries." }] },
    { text: "Budgeting", kind: "technical", matches: [], suggestedProjects: [{ projectId: "food-pantry-budget", why: "Practise spreadsheet formulas." }] },
  ], new Map());
  assert.deepEqual(requirements.map((requirement) => requirement.suggestedProjects[0].title), [
    "Explore a fictional community database with SQL",
    "Build a food pantry budget spreadsheet",
  ]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { projects, keywordProjectSuggestions, communityVenues, calgaryAreas, atVenue } from "./projects.mjs";
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

test("every example project sits at a distinct public Calgary venue", () => {
  const places = new Set();
  for (const project of projects) {
    assert.ok(project.orgName && project.orgType, project.id);
    assert.ok(project.lat > 50.84 && project.lat < 51.22, `${project.id} latitude`);
    assert.ok(project.lng > -114.32 && project.lng < -113.86, `${project.id} longitude`);
    places.add(`${project.lat},${project.lng}`);
  }
  assert.equal(places.size, projects.length);
  assert.equal(new Set(communityVenues.map((venue) => venue.id)).size, communityVenues.length);
  assert.throws(() => atVenue("someone-at-home"), /Unknown venue/);
  for (const area of calgaryAreas) {
    assert.ok(area.lat > 50.84 && area.lat < 51.22 && area.lng > -114.32 && area.lng < -113.86, area.label);
  }
  assert.equal(new Set(calgaryAreas.map((area) => area.label)).size, calgaryAreas.length);
});

test("SQL gaps point to a project that explicitly practises SQL", () => {
  const suggestions = keywordProjectSuggestions("Basic SQL or database experience");
  assert.deepEqual(suggestions.map((project) => project.id), ["community-sql-report", "sql-food-pantry"]);
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

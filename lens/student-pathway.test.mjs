import test from "node:test";
import assert from "node:assert/strict";
import { buildStudentPathway } from "./student-pathway.mjs";

const priya = [{
  index: 0,
  payload: { mappings: [
    { skill: "Communication", quote: "Priya explained every step clearly." },
    { skill: "Digital", quote: "She showed me how to make a video call." },
  ] },
}];

test("compares job skill hints with the student's evidence and links gaps to projects", () => {
  const result = buildStudentPathway("Communication and computer skills. Experience with SQL and Excel.", priya);
  const byName = Object.fromEntries(result.map((item) => [item.name, item]));
  assert.equal(byName.Communication.evidence[0].index, 0);
  assert.equal(byName.Digital.evidence[0].quote, "She showed me how to make a video call.");
  assert.deepEqual(byName.SQL.evidence, []);
  assert.equal(byName.SQL.projects[0].id, "community-sql-report");
  assert.deepEqual(byName.Excel.evidence, []);
  assert.equal(byName.Excel.projects[0].id, "food-pantry-budget");
  assert.match(byName.SQL.context, /SQL/);
});

test("specific tools require a mention in signed evidence, not a generic skill label", () => {
  const evidence = [{ index: 1, payload: { mappings: [{ skill: "Digital", quote: "Built an Excel spreadsheet and ran SQL queries." }] } }];
  const result = buildStudentPathway("Excel, spreadsheets and SQL", evidence);
  for (const name of ["Excel", "Spreadsheets", "SQL"]) {
    assert.equal(result.find((item) => item.name === name).evidence[0].index, 1);
  }
});

test("unknown or unrecognized requirements do not invent projects or evidence", () => {
  assert.deepEqual(buildStudentPathway("Class 5 licence and weekend availability", priya), []);
  const result = buildStudentPathway("Python development", priya);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].evidence, []);
  assert.deepEqual(result[0].projects, []);
});

test("new evidence closes a recognized gap without changing unrelated skills", () => {
  const posting = "Strong communication and SQL skills";
  const before = buildStudentPathway(posting, priya);
  const after = buildStudentPathway(posting, [...priya, { index: 1, payload: { mappings: [{ skill: "Digital", quote: "Used SQL to count event registrations." }] } }]);
  assert.equal(before.find((item) => item.name === "SQL").evidence.length, 0);
  assert.equal(after.find((item) => item.name === "SQL").evidence.length, 1);
  assert.equal(after.find((item) => item.name === "Communication").evidence.length, 1);
});

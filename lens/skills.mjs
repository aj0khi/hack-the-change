// Keyword rules for the nine Skills for Success. Shared by the browser (offline lens fallback,
// keyword suggestions) and the server (Calgary demand counts over cached Adzuna postings).
export const skillTerms = {
  Communication: /\b(communicat\w*|explain\w*|present\w*|interpersonal|customer service)\b/i,
  Digital: /\b(digital|technology|technical|computer\w*|software|spreadsheet\w*|excel)\b/i,
  "Problem solving": /\b(problem[ -]solv\w*|troubleshoot\w*|solve problems)\b/i,
  Collaboration: /\b(collaborat\w*|teamwork|team player|work(ing)? with (a |the )?team)\b/i,
  Adaptability: /\b(adaptab\w*|adapt\w*|flexib\w*|fast[- ]paced)\b/i,
  Writing: /\b(writ\w*|documentation|document\w*)\b/i,
  Reading: /\b(reading|interpret\w*|comprehension)\b/i,
  Numeracy: /\b(numeracy|numerical|calculat\w*|math\w*|accounting|budget\w*)\b/i,
  "Creativity and innovation": /\b(creativ\w*|innovat\w*)\b/i,
};

// How many postings mention each skill at least once.
export function skillDemand(jobs) {
  const list = Array.isArray(jobs) ? jobs : [];
  const counts = Object.fromEntries(Object.keys(skillTerms).map((skill) => [skill, 0]));
  for (const job of list) {
    const text = `${job?.title ?? ""} ${job?.description ?? ""}`;
    for (const [skill, pattern] of Object.entries(skillTerms)) if (pattern.test(text)) counts[skill]++;
  }
  return { total: list.length, counts };
}

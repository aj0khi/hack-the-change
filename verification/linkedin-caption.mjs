export function linkedinCaption(payload, url) {
  return `Fictional Proofly demo credential\n\n${payload.student} — ${payload.title}\nDemo issuer: ${payload.issuer}\nSkills: ${payload.mappings.map(mapping => mapping.skill).join(", ")}\n\nVerify the demo signature: ${url}\n\nFictional demo only. This is not a real award or verified achievement.`;
}

export function backingEligibility({ recipient, witness, coordinator, organization, existingBacking = false }) {
  const problems = [];
  const people = [recipient, witness, coordinator];

  if (people.some(person => !person?.id || person.status !== 'active')) problems.push('All participants must have active accounts.');
  if (people.some(person => person?.identityStatus !== 'verified' || person?.identityUniqueness !== 'approved' || !person?.identityKey)) problems.push('All participants need an independently reviewed identity verification.');
  if (people.some(person => person?.contactStatus !== 'verified')) problems.push('All participants need a verified contact method.');
  if (new Set(people.map(person => person?.id).filter(Boolean)).size !== 3 || new Set(people.map(person => person?.identityKey).filter(Boolean)).size !== 3) problems.push('The recipient, witness, and coordinator must be different people.');
  if (!organization?.id || organization.status !== 'approved' || organization.registryStatus !== 'verified') problems.push('The organization must have an independently verified registry record.');
  if (organization?.contactStatus !== 'verified') problems.push('The organization must have an independently verified contact.');
  if (!coordinator?.organizationId || coordinator.organizationId !== organization?.id || coordinator.organizationRole !== 'approved_coordinator') problems.push('The coordinator must be approved by the verified organization.');
  if (existingBacking) problems.push('A backing for this task and witness already exists.');

  return { allowed: problems.length === 0, problems };
}
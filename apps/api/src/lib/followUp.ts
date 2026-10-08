// ADR-0011: the fire time of a follow-up. Pure; `hours` are real elapsed hours
// (not wall-clock), so across a DST change it is still exactly N * 3600 s.
const HOUR_MS = 3_600_000;

export function followUpFireAt(at: Date, hours: number): Date {
  return new Date(at.getTime() + hours * HOUR_MS);
}

/** The completion time a pending `fireAt` was computed from (inverse of followUpFireAt). */
export function followUpBase(fireAt: Date, hours: number): Date {
  return new Date(fireAt.getTime() - hours * HOUR_MS);
}

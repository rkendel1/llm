export type VerificationPriority = "high" | "normal" | "rare";
export interface VerificationSchedule { modelId: string; priority: VerificationPriority; lastVerifiedAt?: string }
const INTERVAL_MS: Record<VerificationPriority, number> = { high: 6 * 60 * 60 * 1000, normal: 7 * 86_400_000, rare: 30 * 86_400_000 };

export function verificationDue(schedule: VerificationSchedule, now = new Date()): boolean {
  if (!schedule.lastVerifiedAt) return true;
  return now.getTime() - new Date(schedule.lastVerifiedAt).getTime() >= INTERVAL_MS[schedule.priority];
}

export function dueVerifications(schedules: VerificationSchedule[], now = new Date()): VerificationSchedule[] {
  const rank: Record<VerificationPriority, number> = { high: 0, normal: 1, rare: 2 };
  return schedules.filter((item) => verificationDue(item, now)).sort((a, b) => rank[a.priority] - rank[b.priority]);
}

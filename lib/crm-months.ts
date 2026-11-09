type Project = { id: string; clientId: string | null; ownerMemberId: string; stage: string; completedAt?: string | null; createdAt?: string; revenueId: string | null; expectedRevenueMinor: number; expectedMarginMinor: number };
type Revenue = { id: string; pipelineItemId?: string | null; revenueMonth: string; projectedRevenueMinor: number; projectedMarginMinor: number };

export function carryForwardPlan(projects: Project[], revenues: Revenue[], sourceMonth: string, targetMonth: string) {
  const entries = [];
  let skipped = 0;
  for (const project of projects) {
    if (project.completedAt || !["l3", "l4", "l5"].includes(project.stage) || !project.clientId || (project.createdAt && project.createdAt.slice(0, 7) > sourceMonth)) continue;
    const linked = revenues.find((row) => row.id === project.revenueId);
    if (revenues.some((row) => row.pipelineItemId === project.id && row.revenueMonth === targetMonth) || linked?.revenueMonth === targetMonth) { skipped += 1; continue; }
    const prior = revenues.filter((row) => row.pipelineItemId === project.id && row.revenueMonth <= sourceMonth).sort((a, b) => b.revenueMonth.localeCompare(a.revenueMonth))[0];
    const source = prior || (linked && linked.revenueMonth <= sourceMonth ? linked : undefined);
    entries.push({ pipelineItemId: project.id, clientId: project.clientId, ownerMemberId: project.ownerMemberId, revenueMonth: targetMonth, projectedRevenueMinor: source?.projectedRevenueMinor ?? project.expectedRevenueMinor, projectedMarginMinor: source?.projectedMarginMinor ?? project.expectedMarginMinor, actualRevenueMinor: null, actualMarginMinor: null });
  }
  return { entries, skipped };
}

import { type Prisma } from '@lifeos/database';
import { type PlannerChatResponse, type ProposalDto } from '@lifeos/shared';

export type { ProposalDto };
export type ChatResponse = PlannerChatResponse;

type ProposalRow = Prisma.PlanningProposalGetPayload<{ include: { changes: true } }>;

export function toProposalDto(p: ProposalRow): ProposalDto {
  return {
    id: p.id,
    status: p.status,
    revision: p.revision,
    periodStart: p.periodStart.toISOString(),
    periodEnd: p.periodEnd.toISOString(),
    summary: p.summary,
    explanation: (p.explanation as ProposalDto['explanation']) ?? null,
    score: p.score === null ? null : Number(p.score),
    expiresAt: p.expiresAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
    appliedAt: p.appliedAt?.toISOString() ?? null,
    conversationId: p.conversationId,
    supersedesId: p.supersedesId,
    changes: p.changes.map((c) => ({
      id: c.id,
      type: c.type,
      decision: c.decision,
      title: c.title,
      targetTaskId: c.targetTaskId,
      startAt: c.startAt?.toISOString() ?? null,
      endAt: c.endAt?.toISOString() ?? null,
      reason: c.reason,
    })),
  };
}

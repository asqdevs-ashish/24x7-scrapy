import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { RATING_TIERS, type RatingTier } from '@/lib/filters';
import { leadFilterSchema, paramsToObject, resolveLeadWhere, tierWhere } from '@/lib/leads-query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/leads/stats?<same filters as /api/leads>
// Counts per (has_website × rating tier). Tiers partition every lead, so the
// per-segment totals are the sums of their tiers.
export async function GET(req: NextRequest) {
  const parsed = leadFilterSchema.safeParse(paramsToObject(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid filters', issues: parsed.error.flatten() }, { status: 400 });
  }

  const base = await resolveLeadWhere(parsed.data);
  const combos = ([true, false] as const).flatMap((hasWebsite) =>
    RATING_TIERS.map((tier) => ({ hasWebsite, tier })),
  );

  const counts = await prisma.$transaction(
    combos.map(({ hasWebsite, tier }) =>
      prisma.realtorLead.count({ where: { AND: [base, { has_website: hasWebsite }, tierWhere(tier)] } }),
    ),
  );

  const segment = (hasWebsite: boolean) => {
    const tiers = {} as Record<RatingTier, number>;
    combos.forEach((c, i) => {
      if (c.hasWebsite === hasWebsite) tiers[c.tier] = counts[i];
    });
    return { total: Object.values(tiers).reduce((a, b) => a + b, 0), tiers };
  };

  const withWebsite = segment(true);
  const withoutWebsite = segment(false);

  return NextResponse.json({
    total: withWebsite.total + withoutWebsite.total,
    withWebsite,
    withoutWebsite,
  });
}

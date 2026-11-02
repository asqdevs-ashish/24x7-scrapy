import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildLeadOrderBy, LEAD_SELECT, leadListSchema, paramsToObject, resolveLeadWhere } from '@/lib/leads-query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/leads?minReviews=1&maxReviews=100&ratings=4,5&website=no&name=sai&page=1&pageSize=50
export async function GET(req: NextRequest) {
  const parsed = leadListSchema.safeParse(paramsToObject(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid filters', issues: parsed.error.flatten() }, { status: 400 });
  }

  const q = parsed.data;
  const where = await resolveLeadWhere(q);

  const [total, data] = await prisma.$transaction([
    prisma.realtorLead.count({ where }),
    prisma.realtorLead.findMany({
      where,
      select: LEAD_SELECT,
      orderBy: buildLeadOrderBy(q),
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);

  return NextResponse.json({ data, total, page: q.page, pageSize: q.pageSize });
}

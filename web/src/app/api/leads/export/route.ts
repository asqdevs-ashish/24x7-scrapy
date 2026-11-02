import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { csvRow } from '@/lib/csv';
import { buildLeadOrderBy, LEAD_SELECT, leadListSchema, paramsToObject, resolveLeadWhere } from '@/lib/leads-query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_ROWS = 50_000;
const BATCH = 1_000;

const HEADER = [
  'Business Name',
  'Category',
  'Google Category',
  'Phone',
  'Rating',
  'Reviews',
  'Has Website',
  'Website',
  'Social / Directory Page',
  'Address',
  'Latitude',
  'Longitude',
  'Google Maps URL',
  'Search Location',
  'Job ID',
  'Added At',
];

// GET /api/leads/export?<same filters + sort as /api/leads>
// GET /api/leads/export?stateGrouping=Karnataka   → every lead of every Karnataka job
// Streams a CSV of exactly the rows the grid would show (all pages), in batches,
// so large exports never sit fully in memory.
export async function GET(req: NextRequest) {
  const parsed = leadListSchema.safeParse(paramsToObject(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid filters', issues: parsed.error.flatten() }, { status: 400 });
  }

  const q = parsed.data;
  const where = await resolveLeadWhere(q);
  const orderBy = buildLeadOrderBy(q);
  const total = await prisma.realtorLead.count({ where });
  const limit = Math.min(total, MAX_ROWS);

  const encoder = new TextEncoder();
  let offset = 0;
  let headerSent = false;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!headerSent) {
          headerSent = true;
          controller.enqueue(encoder.encode('﻿' + csvRow(HEADER))); // BOM → Excel reads UTF-8
          if (!limit) controller.close();
          return;
        }

        const rows = await prisma.realtorLead.findMany({
          where,
          orderBy,
          select: LEAD_SELECT,
          skip: offset,
          take: Math.min(BATCH, limit - offset),
        });

        let chunk = '';
        for (const r of rows) {
          chunk += csvRow([
            r.business_name,
            r.category,
            r.google_category,
            r.phone,
            r.rating,
            r.reviews_count,
            r.has_website,
            r.website_url,
            r.social_url,
            r.address,
            r.latitude,
            r.longitude,
            r.maps_url,
            r.search_location,
            r.job_id,
            r.created_at,
          ]);
        }
        if (chunk) controller.enqueue(encoder.encode(chunk));

        offset += rows.length;
        if (!rows.length || offset >= limit) controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const scope = q.stateGrouping
    ? `${q.stateGrouping.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'state'}-`
    : q.jobId
      ? `job${q.jobId}-`
      : '';
  const filename = `realtor-leads-${scope}${stamp}.csv`;

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Export-Rows': String(limit),
      'X-Export-Total': String(total),
    },
  });
}

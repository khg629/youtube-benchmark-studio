import { NextResponse } from "next/server";
import { listVideos } from "@/lib/db";
import {
  searchPage,
  type SearchDuration,
  type SearchSortBy,
  type SearchUploadDate,
} from "@/lib/youtube";

const VALID_SORT: SearchSortBy[] = ["relevance", "rating", "upload_date", "view_count"];
const VALID_DATE: SearchUploadDate[] = ["all", "hour", "today", "week", "month", "year"];
const VALID_DURATION: SearchDuration[] = ["all", "short", "medium", "long"];

function pick<T extends string>(v: string | null, allowed: T[]): T | undefined {
  return v && (allowed as string[]).includes(v) ? (v as T) : undefined;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [], saved_ids: [], exhausted: true });

  const more = url.searchParams.get("more") === "true";
  const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get("pageSize") ?? "50", 10)));
  const filters = {
    sort_by: pick(url.searchParams.get("sort"), VALID_SORT),
    upload_date: pick(url.searchParams.get("upload"), VALID_DATE),
    duration: pick(url.searchParams.get("duration"), VALID_DURATION),
  };

  try {
    const { results, exhausted } = await searchPage(q, filters, { fresh: !more, pageSize });
    const saved = new Set(listVideos().map((v) => v.id));
    return NextResponse.json({
      results,
      saved_ids: results.filter((r) => saved.has(r.id)).map((r) => r.id),
      exhausted,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `검색 실패: ${msg}` }, { status: 500 });
  }
}

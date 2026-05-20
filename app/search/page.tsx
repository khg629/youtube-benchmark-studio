import { SearchForm } from "@/components/SearchForm";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">YouTube 검색</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          키워드와 필터로 영상을 찾고, 마음에 드는 걸 벤치마킹 목록에 추가하세요.
        </p>
      </div>
      <SearchForm initialQuery={q ?? ""} />
    </div>
  );
}

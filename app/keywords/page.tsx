import { Suspense } from "react";
import { KeywordResearchForm } from "@/components/KeywordResearchForm";

export const dynamic = "force-dynamic";

export default function KeywordsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">키워드 리서치</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Google 트렌드 + 자동완성으로 키워드의 검색 관심도와 연관 검색어를 한 번에 확인합니다.
          영상 주제 발굴, 제목/태그 작성에 활용하세요.
        </p>
      </div>
      <Suspense fallback={<div className="text-sm text-[color:var(--muted)]">로딩...</div>}>
        <KeywordResearchForm />
      </Suspense>
    </div>
  );
}

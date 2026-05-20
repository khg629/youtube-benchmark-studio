import { SynthesisView } from "@/components/SynthesisView";
import { listVideos } from "@/lib/db";
import { providerStatus } from "@/lib/llm";
import type { Provider } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function SynthesisPage() {
  const videos = listVideos();
  const providers = providerStatus();
  const availability: Record<Provider, boolean> = {
    claude: false,
    openai: false,
    gemini: false,
  };
  for (const p of providers) availability[p.provider] = p.available;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">벤치마크 종합 분석</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          저장된 영상들을 한 번에 분석해 이 분야에서 통하는 공통 패턴 (제목 공식, 썸네일, 길이, 업로드 타이밍)을 도출합니다.
        </p>
      </div>
      <SynthesisView videos={videos} providerAvailability={availability} />
    </div>
  );
}

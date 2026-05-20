import { SettingsForm } from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">설정</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          API 키를 입력하면 즉시 반영됩니다. 재시작 필요 없음.
        </p>
      </div>
      <SettingsForm />

      <section className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-4 text-xs text-[color:var(--muted)]">
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--foreground)]">데이터 위치</h2>
        <p>
          SQLite: <code>data/videos.db</code>
          <br />
          썸네일: <code>data/thumbnails/</code>
        </p>
      </section>
    </div>
  );
}

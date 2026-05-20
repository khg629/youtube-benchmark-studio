"use client";

import { useEffect, useState } from "react";

type KeyProvider = "anthropic" | "openai" | "gemini" | "youtube";
type LLMProvider = "anthropic" | "openai" | "gemini";
type KeySource = "db" | "env" | "none";
type ModelSource = "db" | "env" | "default";

const PROVIDERS: {
  id: KeyProvider;
  label: string;
  description: string;
  link?: string;
  isLLM: boolean;
  modelPresets?: string[];
  modelHint?: string;
}[] = [
  {
    id: "anthropic",
    label: "Claude (Anthropic)",
    description: "영상 분석 LLM",
    link: "https://console.anthropic.com/settings/keys",
    isLLM: true,
    modelPresets: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
    modelHint: "docs.anthropic.com/en/docs/about-claude/models",
  },
  {
    id: "openai",
    label: "ChatGPT (OpenAI)",
    description: "영상 분석 LLM",
    link: "https://platform.openai.com/api-keys",
    isLLM: true,
    modelPresets: ["gpt-4o", "gpt-4o-mini", "o3", "gpt-5"],
    modelHint: "platform.openai.com/docs/models",
  },
  {
    id: "gemini",
    label: "Gemini (Google AI)",
    description: "영상 분석 LLM",
    link: "https://aistudio.google.com/apikey",
    isLLM: true,
    modelPresets: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"],
    modelHint: "ai.google.dev/gemini-api/docs/models",
  },
  {
    id: "youtube",
    label: "YouTube Data API v3",
    description: "댓글 + 답글 수집 (무료, 하루 10,000 units)",
    link: "https://console.cloud.google.com/apis/library/youtube.googleapis.com",
    isLLM: false,
  },
];

interface StatusPayload {
  providers: Record<KeyProvider, { source: KeySource }>;
  models: Record<LLMProvider, { value: string; source: ModelSource; default: string }>;
}

export function SettingsForm() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [keyInputs, setKeyInputs] = useState<Record<KeyProvider, string>>({
    anthropic: "",
    openai: "",
    gemini: "",
    youtube: "",
  });
  const [modelInputs, setModelInputs] = useState<Record<LLMProvider, string>>({
    anthropic: "",
    openai: "",
    gemini: "",
  });
  const [editingKey, setEditingKey] = useState<KeyProvider | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadStatus() {
    const res = await fetch("/api/settings");
    const data = (await res.json()) as StatusPayload;
    setStatus(data);
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function saveKey(p: KeyProvider, value: string | null) {
    setSaving(`key:${p}`);
    setMessage(null);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [p]: value }),
      });
      await loadStatus();
      setKeyInputs((s) => ({ ...s, [p]: "" }));
      setEditingKey(null);
      setMessage(value ? `${p} 키 저장됨` : `${p} 키 삭제됨`);
    } finally {
      setSaving(null);
    }
  }

  async function saveModel(p: LLMProvider, value: string | null) {
    setSaving(`model:${p}`);
    setMessage(null);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ models: { [p]: value } }),
      });
      await loadStatus();
      setModelInputs((s) => ({ ...s, [p]: "" }));
      setMessage(value ? `${p} 모델 저장됨 (${value})` : `${p} 모델 기본값으로 복원됨`);
    } finally {
      setSaving(null);
    }
  }

  if (!status) return <p className="text-sm text-[color:var(--muted)]">불러오는 중…</p>;

  return (
    <div className="flex flex-col gap-4">
      {message && (
        <div className="rounded-md border border-green-900/40 bg-green-950/30 px-3 py-2 text-xs text-green-400">
          ✓ {message}
        </div>
      )}
      {PROVIDERS.map((p) => {
        const keyStatus = status.providers[p.id];
        const isEditingKey = editingKey === p.id;
        const keyBusy = saving === `key:${p.id}`;
        return (
          <div
            key={p.id}
            className="flex flex-col gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">{p.label}</h3>
                <p className="mt-0.5 text-xs text-[color:var(--muted)]">{p.description}</p>
                {p.link && (
                  <a
                    href={p.link}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-[11px] text-[color:var(--accent)] hover:underline"
                  >
                    키 발급받기 ↗
                  </a>
                )}
              </div>
              <KeyBadge source={keyStatus.source} />
            </div>

            {/* API 키 입력 */}
            {isEditingKey ? (
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="API 키 붙여넣기"
                  value={keyInputs[p.id]}
                  onChange={(e) => setKeyInputs((v) => ({ ...v, [p.id]: e.target.value }))}
                  className="flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
                  autoFocus
                />
                <button
                  onClick={() => saveKey(p.id, keyInputs[p.id])}
                  disabled={keyBusy || !keyInputs[p.id].trim()}
                  className="btn-primary px-4 py-2 text-sm"
                >
                  {keyBusy ? "..." : "저장"}
                </button>
                <button
                  onClick={() => {
                    setEditingKey(null);
                    setKeyInputs((v) => ({ ...v, [p.id]: "" }));
                  }}
                  className="rounded-md border border-[color:var(--border)] px-3 py-2 text-sm text-[color:var(--muted)]"
                >
                  취소
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingKey(p.id)}
                  className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-xs hover:text-[color:var(--foreground)]"
                >
                  {keyStatus.source === "none" ? "키 입력" : "변경"}
                </button>
                {keyStatus.source === "db" && (
                  <button
                    onClick={() => saveKey(p.id, null)}
                    disabled={keyBusy}
                    className="rounded-md border border-red-900/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/40 disabled:opacity-50"
                  >
                    {keyBusy ? "..." : "삭제"}
                  </button>
                )}
              </div>
            )}

            {/* 모델 선택 (LLM 제공자만) */}
            {p.isLLM && (
              <ModelRow
                provider={p.id as LLMProvider}
                status={status.models[p.id as LLMProvider]}
                presets={p.modelPresets ?? []}
                docLink={p.modelHint}
                input={modelInputs[p.id as LLMProvider]}
                onInputChange={(v) =>
                  setModelInputs((s) => ({ ...s, [p.id as LLMProvider]: v }))
                }
                onSave={(v) => saveModel(p.id as LLMProvider, v)}
                busy={saving === `model:${p.id}`}
              />
            )}
          </div>
        );
      })}
      <NaverAdSection />
      <YouTubeAuthSection />
      <BackupSection />
      <p className="text-xs text-[color:var(--muted)]">
        키·모델은 <code>data/videos.db</code>의 settings 테이블에 저장되며 즉시 반영됩니다. 재시작 불필요.
      </p>
    </div>
  );
}

function BackupSection() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    if (!file || busy) return;
    if (
      !confirm(
        "선택한 DB로 현재 데이터를 교체할까요? 복원 직전 DB는 data/videos-before-restore-*.db로 한 번 더 저장됩니다.",
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/backup", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "복원 실패");
        return;
      }
      setFile(null);
      setMessage("DB 복원 완료. 화면을 새로고침하면 복원된 데이터가 보입니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">DB 백업 / 복원</h3>
          <p className="mt-0.5 text-xs text-[color:var(--muted)]">
            영상 목록, 메모, 태그, 댓글, 자막, 분석 결과, API 키 설정이 모두 들어 있는 SQLite 파일입니다.
          </p>
        </div>
        <a
          href="/api/backup"
          className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-xs text-[color:var(--accent)] hover:border-[color:var(--accent)]"
        >
          DB 백업 다운로드
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3,application/octet-stream"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="max-w-full rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-xs"
        />
        <button
          onClick={restore}
          disabled={!file || busy}
          className="rounded-md border border-red-900/40 px-3 py-2 text-xs text-red-400 hover:bg-red-950/40 disabled:opacity-50"
        >
          {busy ? "복원 중..." : "선택한 DB로 복원"}
        </button>
      </div>
      {message && (
        <div className="rounded-md border border-green-900/40 bg-green-950/30 px-3 py-2 text-xs text-green-400">
          ✓ {message}
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-900/40 bg-red-950/20 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
      <p className="text-[10px] text-[color:var(--muted)]">
        백업 파일에는 API 키도 포함됩니다. 다른 사람에게 공유하지 마세요.
      </p>
    </div>
  );
}

type AuthStatus =
  | { state: "signed_in" }
  | { state: "pending"; code: { verification_url: string; user_code: string }; expiresAt: number }
  | { state: "error"; message: string }
  | { state: "signed_out" };

function YouTubeAuthSection() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/auth/youtube");
    if (res.ok) setStatus((await res.json()) as AuthStatus);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (status?.state !== "pending") return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [status?.state]);

  async function start() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (!data.ok) setMessage(data.message ?? "시작 실패");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (!confirm("YouTube 계정 연결을 해제할까요? 비공개 영상 다운로드가 불가능해집니다.")) return;
    setBusy(true);
    try {
      await fetch("/api/auth/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      setMessage("로그아웃됨");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-4">
      {message && (
        <div className="rounded-md border border-green-900/40 bg-green-950/30 px-3 py-2 text-xs text-green-400">
          ✓ {message}
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">YouTube 계정 연결</h3>
          <p className="mt-0.5 text-xs text-[color:var(--muted)]">
            본인 계정에 공유된 <b>비공개 영상</b>을 다운로드하려면 연결 필요. 공개·일부공개 영상은 연결 없이 받음.
          </p>
          <p className="mt-1 text-[10px] text-[color:var(--muted)]">
            ※ 검색·메타데이터 수집은 익명 세션을 그대로 사용하므로 추천 알고리즘이 오염되지 않음.
          </p>
        </div>
        <AuthBadge state={status.state} />
      </div>

      {status.state === "signed_in" && (
        <div className="flex gap-2">
          <button
            onClick={logout}
            disabled={busy}
            className="rounded-md border border-red-900/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/40 disabled:opacity-50"
          >
            {busy ? "..." : "연결 해제"}
          </button>
        </div>
      )}

      {status.state === "signed_out" && (
        <div className="flex gap-2">
          <button
            onClick={start}
            disabled={busy}
            className="btn-primary px-3 py-1.5 text-xs"
          >
            {busy ? "..." : "계정 연결 시작"}
          </button>
        </div>
      )}

      {status.state === "pending" && (
        <div className="flex flex-col gap-2 rounded-md border border-[color:var(--border)] bg-[color:var(--background)] p-3 text-sm">
          <p className="text-xs text-[color:var(--muted)]">
            아래 URL을 열고, 코드를 입력 후 본인 YouTube 계정으로 로그인하세요.
          </p>
          <div className="flex items-center gap-2">
            <a
              href={status.code.verification_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-xs text-[color:var(--accent)] hover:underline"
            >
              {status.code.verification_url} ↗
            </a>
          </div>
          <div className="flex items-center gap-2">
            <code className="rounded bg-[color:var(--border)] px-3 py-2 text-base font-mono tracking-widest">
              {status.code.user_code}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(status.code.user_code)}
              className="rounded-md border border-[color:var(--border)] px-2 py-1 text-[11px] text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
            >
              복사
            </button>
          </div>
          <p className="text-[10px] text-[color:var(--muted)]">
            인증이 완료되면 자동으로 상태가 갱신됩니다 (3초마다 확인).
          </p>
        </div>
      )}

      {status.state === "error" && (
        <div className="rounded-md border border-red-900/40 bg-red-950/20 px-3 py-2 text-xs text-red-400">
          오류: {status.message}
          <button
            onClick={start}
            disabled={busy}
            className="ml-3 underline hover:text-red-300"
          >
            다시 시도
          </button>
        </div>
      )}
    </div>
  );
}

function AuthBadge({ state }: { state: AuthStatus["state"] }) {
  if (state === "signed_in")
    return (
      <span className="rounded bg-green-900/30 px-2 py-1 text-[11px] text-green-400">
        ● 연결됨
      </span>
    );
  if (state === "pending")
    return (
      <span className="rounded bg-blue-900/30 px-2 py-1 text-[11px] text-blue-400">
        ● 인증 대기
      </span>
    );
  if (state === "error")
    return (
      <span className="rounded bg-red-900/30 px-2 py-1 text-[11px] text-red-400">
        ● 오류
      </span>
    );
  return (
    <span className="rounded bg-yellow-900/30 px-2 py-1 text-[11px] text-yellow-500">
      ● 미연결
    </span>
  );
}

type NaverAdField = "apiKey" | "secretKey" | "customerId";
type NaverAdStatus = Record<NaverAdField, { source: KeySource }>;

function NaverAdSection() {
  const [status, setStatus] = useState<NaverAdStatus | null>(null);
  const [inputs, setInputs] = useState<Record<NaverAdField, string>>({
    apiKey: "",
    secretKey: "",
    customerId: "",
  });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/settings/naver-ad");
    if (res.ok) setStatus((await res.json()) as NaverAdStatus);
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const payload: Partial<Record<NaverAdField, string>> = {};
      (Object.keys(inputs) as NaverAdField[]).forEach((k) => {
        const v = inputs[k].trim();
        if (v) payload[k] = v;
      });
      const res = await fetch("/api/settings/naver-ad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await load();
        setInputs({ apiKey: "", secretKey: "", customerId: "" });
        setEditing(false);
        setMessage("Naver 검색광고 키 저장됨");
      }
    } finally {
      setSaving(false);
    }
  }

  async function clearAll() {
    if (!confirm("Naver 검색광고 키 3개를 모두 삭제할까요?")) return;
    setSaving(true);
    try {
      await fetch("/api/settings/naver-ad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: null, secretKey: null, customerId: null }),
      });
      await load();
      setMessage("Naver 검색광고 키 삭제됨");
    } finally {
      setSaving(false);
    }
  }

  if (!status) return null;

  const allSet =
    status.apiKey.source !== "none" &&
    status.secretKey.source !== "none" &&
    status.customerId.source !== "none";
  const anyDb =
    status.apiKey.source === "db" ||
    status.secretKey.source === "db" ||
    status.customerId.source === "db";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-4">
      {message && (
        <div className="rounded-md border border-green-900/40 bg-green-950/30 px-3 py-2 text-xs text-green-400">
          ✓ {message}
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Naver 검색광고 API</h3>
          <p className="mt-0.5 text-xs text-[color:var(--muted)]">
            한국어 키워드의 월간 PC/모바일 절대 검색량 (키워드 리서치 페이지에서 사용). 무료.
          </p>
          <a
            href="https://searchad.naver.com/customers"
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-[11px] text-[color:var(--accent)] hover:underline"
          >
            네이버 검색광고 가입 ↗
          </a>
          <p className="mt-1 text-[10px] text-[color:var(--muted)]">
            가입 후 → <b>도구 → API 사용 관리</b>에서 액세스 라이선스/비밀키 발급. Customer ID는 우측 상단 계정 정보에 표시.
          </p>
        </div>
        <KeyBadge source={allSet ? (anyDb ? "db" : "env") : "none"} />
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <NaverField
            label="액세스 라이선스 (X-API-KEY)"
            placeholder="0100000000..."
            value={inputs.apiKey}
            onChange={(v) => setInputs((s) => ({ ...s, apiKey: v }))}
            source={status.apiKey.source}
          />
          <NaverField
            label="비밀키 (Secret Key)"
            placeholder="AQAAAA..."
            value={inputs.secretKey}
            onChange={(v) => setInputs((s) => ({ ...s, secretKey: v }))}
            source={status.secretKey.source}
          />
          <NaverField
            label="Customer ID"
            placeholder="1234567"
            value={inputs.customerId}
            onChange={(v) => setInputs((s) => ({ ...s, customerId: v }))}
            source={status.customerId.source}
          />
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving || !Object.values(inputs).some((v) => v.trim())}
              className="btn-primary px-4 py-2 text-sm"
            >
              {saving ? "..." : "저장"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setInputs({ apiKey: "", secretKey: "", customerId: "" });
              }}
              className="rounded-md border border-[color:var(--border)] px-3 py-2 text-sm text-[color:var(--muted)]"
            >
              취소
            </button>
          </div>
          <p className="text-[10px] text-[color:var(--muted)]">
            ※ 비워두면 기존 값 유지. 일부 필드만 갱신하려면 그 필드만 입력하세요.
          </p>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-xs hover:text-[color:var(--foreground)]"
          >
            {allSet ? "변경" : "키 입력"}
          </button>
          {anyDb && (
            <button
              onClick={clearAll}
              disabled={saving}
              className="rounded-md border border-red-900/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/40 disabled:opacity-50"
            >
              전체 삭제
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NaverField({
  label,
  placeholder,
  value,
  onChange,
  source,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  source: KeySource;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs text-[color:var(--muted)]">{label}</label>
        <span className="text-[10px] text-[color:var(--muted)]">
          {source === "db" ? "저장됨 (DB)" : source === "env" ? "저장됨 (env)" : "미설정"}
        </span>
      </div>
      <input
        type="password"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
      />
    </div>
  );
}

function ModelRow({
  provider,
  status,
  presets,
  docLink,
  input,
  onInputChange,
  onSave,
  busy,
}: {
  provider: LLMProvider;
  status: { value: string; source: ModelSource; default: string };
  presets: string[];
  docLink?: string;
  input: string;
  onInputChange: (v: string) => void;
  onSave: (v: string | null) => void;
  busy: boolean;
}) {
  return (
    <div className="border-t border-[color:var(--border)] pt-3">
      <div className="flex items-center justify-between">
        <div className="text-xs">
          <span className="text-[color:var(--muted)]">모델:</span>{" "}
          <code className="text-[color:var(--foreground)]">{status.value}</code>
          <ModelBadge source={status.source} />
        </div>
        {docLink && (
          <a
            href={`https://${docLink}`}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
          >
            모델 목록 ↗
          </a>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          type="text"
          placeholder={`예: ${status.default}`}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          className="flex-1 min-w-[200px] rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-1.5 text-sm outline-none focus:border-[color:var(--accent)]"
        />
        <button
          onClick={() => onSave(input)}
          disabled={busy || !input.trim() || input.trim() === status.value}
          className="btn-primary px-3 py-1.5 text-xs"
        >
          {busy ? "..." : "변경"}
        </button>
        {status.source === "db" && (
          <button
            onClick={() => onSave(null)}
            disabled={busy}
            className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-xs text-[color:var(--muted)] hover:text-[color:var(--foreground)] disabled:opacity-50"
          >
            기본값
          </button>
        )}
      </div>
      {presets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="text-[10px] text-[color:var(--muted)]">자주 쓰는 모델:</span>
          {presets.map((m) => (
            <button
              key={m}
              onClick={() => onInputChange(m)}
              className="rounded border border-[color:var(--border)] px-1.5 py-0.5 text-[10px] text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function KeyBadge({ source }: { source: KeySource }) {
  if (source === "db")
    return (
      <span className="rounded bg-green-900/30 px-2 py-1 text-[11px] text-green-400">
        ● 사용 중 (UI 저장)
      </span>
    );
  if (source === "env")
    return (
      <span className="rounded bg-blue-900/30 px-2 py-1 text-[11px] text-blue-400">
        ● 사용 중 (.env.local)
      </span>
    );
  return (
    <span className="rounded bg-yellow-900/30 px-2 py-1 text-[11px] text-yellow-500">
      ● 키 없음
    </span>
  );
}

function ModelBadge({ source }: { source: ModelSource }) {
  const styles = {
    db: "text-green-400",
    env: "text-blue-400",
    default: "text-[color:var(--muted)]",
  } as const;
  const labels = { db: "UI 지정", env: ".env", default: "기본값" } as const;
  return (
    <span className={`ml-2 text-[10px] ${styles[source]}`}>· {labels[source]}</span>
  );
}

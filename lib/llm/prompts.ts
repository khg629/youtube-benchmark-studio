import type { Comment, Video, VideoTranscript } from "../types";
import { computeSynthesisStats, formatStatsForPrompt, formatVideoListForPrompt } from "../synthesis-stats";
import { formatTimestamp } from "../transcript";

function formatViews(n: number | null): string {
  if (n == null) return "알 수 없음";
  return n.toLocaleString("ko-KR") + "회";
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "알 수 없음";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function daysSinceNumber(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function daysSince(iso: string | null): string {
  const d = daysSinceNumber(iso);
  return d == null ? "알 수 없음" : `${d}일 전`;
}

const MAX_COMMENTS_IN_PROMPT = 100;
const MAX_COMMENT_CHARS = 500;

function formatComments(comments: Comment[]): string {
  if (!comments || comments.length === 0) return "";
  // 좋아요 순 상위 N개
  const sorted = [...comments].sort((a, b) => (b.like_count ?? 0) - (a.like_count ?? 0));
  const top = sorted.slice(0, MAX_COMMENTS_IN_PROMPT);
  const lines = top.map((c, i) => {
    const text =
      c.text.length > MAX_COMMENT_CHARS
        ? c.text.slice(0, MAX_COMMENT_CHARS) + "…"
        : c.text;
    const likes = c.like_count != null ? ` [👍${c.like_count}]` : "";
    const pin = c.is_pinned ? " [📌]" : "";
    const owner = c.is_channel_owner ? " [채널주인]" : "";
    const parent = c.parent_id ? " [답글]" : "";
    return `${i + 1}.${likes}${pin}${owner}${parent} ${text.replace(/\n+/g, " ")}`;
  });
  return lines.join("\n");
}

function computeStats(v: Video): string {
  const days = daysSinceNumber(v.upload_date);
  const parts: string[] = [];
  if (v.view_count != null && days != null && days > 0) {
    const perDay = Math.round(v.view_count / days);
    parts.push(`일평균 조회수 약 ${perDay.toLocaleString("ko-KR")}회/일`);
  }
  if (v.view_count != null && v.like_count != null && v.view_count > 0) {
    const ratio = ((v.like_count / v.view_count) * 100).toFixed(2);
    parts.push(`좋아요 비율 ${ratio}%`);
  }
  return parts.length > 0 ? `계산값: ${parts.join(", ")}` : "";
}

export function buildAnalysisPrompt(v: Video, comments: Comment[] = []): string {
  const tags = v.tags.length > 0 ? v.tags.slice(0, 20).join(", ") : "없음";
  const desc = (v.description ?? "").slice(0, 1500);
  const uploadedLine = v.upload_date
    ? `${v.upload_date.slice(0, 10)} (${daysSince(v.upload_date)})`
    : "알 수 없음";
  const stats = computeStats(v);

  const hasComments = comments.length > 0;
  const topLevelCount = comments.filter((c) => !c.parent_id).length;
  const replyCount = comments.length - topLevelCount;
  const commentSummary = hasComments
    ? `(댓글 ${topLevelCount}개${replyCount > 0 ? ` + 답글 ${replyCount}개` : ""} 수집, 좋아요 순 상위 ${Math.min(
        comments.length,
        MAX_COMMENTS_IN_PROMPT,
      )}개만 전달)`
    : "";

  const commentsBlock = hasComments
    ? `
[시청자 댓글] ${commentSummary}
${formatComments(comments)}
`
    : "\n(댓글 데이터 없음 — 메타데이터와 썸네일만으로 분석)\n";

  const commentsSection = hasComments
    ? `
## 4. 시청자 반응 신호 분석 (댓글 기반)
- **반복되는 감정/반응 키워드** 3~5개를 빈도 추정치와 함께 나열 (예: "'충격' 계열 단어 약 12회 언급")
- **가장 공감한 포인트**: 좋아요 많이 받은 댓글에서 공통적으로 나오는 주제 (직접 인용 1~2줄 포함)
- **불만/아쉬움/요청 사항**: 있으면 구체 인용, 없으면 "없음" 명시
- **공유·확산 신호**: "친구한테 공유", "내 얘기 같다", "다시 찾아봄" 같은 문구가 있는가
- **채널 주인 답글 패턴**: 채널 주인이 어떻게 시청자와 상호작용하는지 (빈도·톤)
- **다음 콘텐츠 아이디어**: 댓글에서 드러나는 시청자 니즈 → 후속 영상 각도 2~3개
`
    : "";

  return `너는 YouTube 알고리즘과 콘텐츠 전략을 10년 분석한 시니어 컨설턴트다.
사용자는 이 영상이 왜 평균을 뛰어넘어 '떡상'했는지를 **가설-근거 형식으로 집요하게** 파헤쳐달라고 요청했다.

[분석 원칙]
- "콘텐츠가 좋아서" "진정성이 있어서" 같은 뻔한 결론은 금지. 구체적 메커니즘을 집어내라.
- 근거는 제목·썸네일·설명·태그·댓글·채널 규모·업로드 시점·숫자 지표에서 직접 인용·추론하라.
- 숫자/팩트를 최대한 인용하라 (예: "조회수 120만은 구독자 12만의 10배, 즉 알고리즘이 구독자 밖으로 밀었다는 신호").
- 벤치마킹이 실제 가능하도록 "이 요소 → 이 효과" 원리 형태로 변환하라.
- 확신 있는 건 단정적으로, 추측인 건 "추정됨", "가능성 있음"으로 명시하라.

[영상 정보]
- 제목: ${v.title}
- 채널: ${v.channel_name ?? "알 수 없음"}
- 조회수: ${formatViews(v.view_count)}
- 좋아요: ${formatViews(v.like_count)}
- 업로드: ${uploadedLine}
- 영상 길이: ${formatDuration(v.duration_seconds)}
- YouTube 태그: ${tags}
${stats ? `- ${stats}` : ""}
- 설명 (앞부분):
${desc || "(설명 없음)"}

썸네일 이미지는 첨부되어 있다.
${commentsBlock}
---

다음 6개 섹션으로 반드시 답하라. 각 섹션은 **근거 인용 + 구체적 표현** 중심으로:

## 1. 제목 엔지니어링 분해
- **감정·인지 트리거**: 호기심 공백, 숫자, 대비, 정체성 신호, 금기, 시간 압박, 권위/반권위 중 어떤 장치가 몇 개 들어갔는가 (해당하는 것만)
- **검색 의도 매칭**: 이 제목이 어떤 검색 키워드를 노리는가 2~3개
- **피드 클릭 메커니즘**: 구독 안 한 사람이 피드에서 봤을 때 이 제목이 클릭을 유발하는 지점

## 2. 썸네일 시각 훅 분해
- **주 피사체**: 인물/사물, 표정·시선·포즈
- **색상 팔레트와 대비**: 피드의 다른 썸네일 사이에서 눈에 띄게 만드는 시각적 장치
- **텍스트 오버레이**: 문구·폰트·크기·위치, 텍스트가 제목과 다른 정보를 주는가 중복인가
- **제목-썸네일 시너지**: 제목만 읽은 사람 vs 썸네일만 본 사람 각각 어떤 궁금증이 생기는가

## 3. 떡상 메커니즘 (이 영상이 뜬 진짜 이유)
### 3-1. 채널 기준선 대비 성과
- 조회수 vs 구독자 비율 계산 (숫자 직접 인용)
- 구독자 범위 내 소비 / 구독자 밖으로 퍼짐 / 알고리즘 폭발적 추천 중 어느 쪽인가
### 3-2. 주된 유입 경로 추정
- 구독자 피드 / 추천 피드 / 검색 / 외부 공유 중 어디가 주도했을지 (근거와 함께)
### 3-3. 타이밍·트렌드 연결
- 업로드 시점이 특정 이슈·시즌·트렌드와 맞물렸는가 (있으면 구체적으로)
### 3-4. CTR 폭발 요인 vs 리텐션 요인 분리
- CTR(클릭률)을 터뜨린 가장 강력한 요소 1가지 (제목/썸네일 중)
- 리텐션(시청 유지)을 잡았을 가능성이 큰 요소 1가지 (댓글·설명에서 드러나는 구성·훅 단서)
${commentsSection}
## 5. 벤치마킹 액션 아이템 (내가 훔쳐 쓸 것)
다음 4가지를 **내 영상에서 바로 적용 가능한 형태**로 정리:
1. **제목 공식**: 이 영상이 쓴 제목 패턴을 내 주제에 대입한 예시 제목 1개
2. **썸네일 공식**: 시각 장치 1개를 내 썸네일에 어떻게 적용할지 구체적 지시
3. **구성·훅 공식**: (댓글·설명에서 추정 가능한 한도 내) 초반 훅 또는 중반 반전 구조 1개
4. **주제 각도 재활용**: 이 영상이 다룬 **"각도"**를 내 주제에 대입한 예시 영상 아이디어 1개

## 6. 한 줄 결론
이 영상이 떡상한 가장 결정적인 이유를 한 문장으로 단정적으로 쓴다.

---
전체를 한국어로 답하라. 각 섹션은 bullet 또는 짧은 단락 형태로 읽기 쉽게. 불필요한 서론·마무리 말 없이 바로 섹션부터 시작.`;
}

const MAX_COMMENTS_FOR_INSIGHT = 200;

export function buildCommentInsightPrompt(v: Video, comments: Comment[]): string {
  if (comments.length === 0) {
    throw new Error("댓글 데이터가 없습니다");
  }
  // 인사이트 분석은 더 많은 댓글을 보여줌 (좋아요 순 + 답글 포함)
  const sorted = [...comments].sort((a, b) => (b.like_count ?? 0) - (a.like_count ?? 0));
  const topN = sorted.slice(0, MAX_COMMENTS_FOR_INSIGHT);
  const lines = topN.map((c, i) => {
    const text =
      c.text.length > MAX_COMMENT_CHARS ? c.text.slice(0, MAX_COMMENT_CHARS) + "…" : c.text;
    const likes = c.like_count != null ? ` [👍${c.like_count}]` : "";
    const pin = c.is_pinned ? " [📌]" : "";
    const owner = c.is_channel_owner ? " [채널주인]" : "";
    const parent = c.parent_id ? " [답글]" : "";
    return `${i + 1}.${likes}${pin}${owner}${parent} ${text.replace(/\n+/g, " ")}`;
  });
  const commentsBlock = lines.join("\n");

  const topLevelCount = comments.filter((c) => !c.parent_id).length;
  const replyCount = comments.length - topLevelCount;
  const summary = `(전체 댓글 ${topLevelCount}개${replyCount > 0 ? ` + 답글 ${replyCount}개` : ""}, 좋아요 순 상위 ${Math.min(comments.length, MAX_COMMENTS_FOR_INSIGHT)}개 분석)`;

  return `너는 YouTube 채널 운영자의 콘텐츠 전략가다.
사용자는 자신의 채널을 키우려고 이 벤치마크 영상의 **댓글에서 시청자가 진짜 원하는 것**을 뽑아달라고 요청했다.
일반 영상 분석이 아니라 오직 **댓글 데이터에 깊게 들어가서** 다음 영상에 쓸 수 있는 실행 가능한 인사이트만 뽑아라.

[분석 원칙]
- "긍정적이다", "반응이 좋다" 같은 무의미한 요약 금지. 시청자의 **구체적 발화**를 인용하라.
- 추측이 아닌 댓글에 실제로 있는 단어·문장을 근거로 들어라. 직접 인용 (큰따옴표).
- 시청자가 말로 표현한 욕구·결핍·질문을 **다음 영상의 주제 후보**로 변환하라.
- 단순한 칭찬은 무시. "왜" 좋다고 했는지 핵심을 잡아라.

[영상 정보]
- 제목: ${v.title}
- 채널: ${v.channel_name ?? "알 수 없음"}
- 조회수: ${formatViews(v.view_count)} · 좋아요: ${formatViews(v.like_count)}
- 업로드: ${v.upload_date?.slice(0, 10) ?? "알 수 없음"}

[댓글] ${summary}
${commentsBlock}

---

다음 5개 섹션으로 답하라. 각 항목은 **댓글 직접 인용 1~2줄 포함** 필수.

## 1. 자주 나오는 질문 (다음 영상 주제 후보)
시청자가 댓글에서 묻고 있는 질문을 **빈도순 상위 5개**.
- 형식: 질문 요지 → 인용 1줄 → 추정 빈도 (예: "약 8회 등장")
- 답이 없는 질문일수록 좋은 다음 영상 주제

## 2. 불만·요청·아쉬움 (개선 신호)
- 영상에 대한 **건설적 불만/요청** 3~5개. "이 부분이 짧았다", "이런 것도 다뤄달라" 같은 구체 요청.
- 각 항목에 인용 1줄 + 어떻게 다음 영상에서 보완할지 짧은 제안

## 3. 욕망·정체성 신호 (시청자가 되고 싶어하는 모습)
- "저도 ... 해보고 싶다", "이렇게 살고 싶다", "내 얘기 같다" 같은 **욕망/공감 패턴** 3개
- 각 패턴별 인용 1~2줄
- 이 욕망을 자극하는 **다음 영상 각도** 1개씩 제안

## 4. 칭찬받은 결정적 장면·요소
- 좋아요 많이 받은 댓글에서 **언급된 구체적 장면/표현/구간** 추출 (타임스탬프 언급 있으면 그대로)
- "어떤 장면/표현/구성이 시청자를 잡았는가" 3~5개
- 각각 인용 + "이 효과를 내가 어떻게 재현할지" 한 줄

## 5. 다음 영상 5개 후보 (즉시 실행 가능)
위 1~4 분석에서 도출한 **새로운 영상 5개**를 다음 형식으로:
| # | 제목 후보 | 근거 (어느 섹션에서 나왔나) | 우선순위 (높음/중간/낮음) |
|---|---|---|---|
| 1 | ... | ... | ... |
- 우선순위는 댓글 빈도·좋아요 수·욕망 강도 종합 판단
- 제목 후보는 클릭 유도형으로 다듬어서

---

전체를 한국어로. 서론·마무리 없이 바로 섹션부터.`;
}

const MAX_TRANSCRIPT_CHARS = 25000; // ~6K~10K tokens 에 해당

export function buildScriptInsightPrompt(v: Video, transcript: VideoTranscript): string {
  if (transcript.segments.length === 0) {
    throw new Error("자막 데이터가 비어있습니다");
  }

  // 전체 자막을 timestamped 형식으로 만들되 너무 길면 잘라냄
  const lines: string[] = [];
  let totalChars = 0;
  let truncated = false;
  for (const seg of transcript.segments) {
    const line = `[${formatTimestamp(seg.start_ms)}] ${seg.text}`;
    if (totalChars + line.length > MAX_TRANSCRIPT_CHARS) {
      truncated = true;
      break;
    }
    lines.push(line);
    totalChars += line.length + 1;
  }
  const transcriptBlock = lines.join("\n") + (truncated ? "\n...[자막이 너무 길어 일부만 포함]" : "");

  const days = daysSinceNumber(v.upload_date);
  const dayInfo = days != null ? `${days}일 전` : "알 수 없음";
  const viewLine =
    v.view_count != null && days != null && days > 0
      ? `조회수 ${v.view_count.toLocaleString("ko-KR")}회 (일평균 ${Math.round(v.view_count / days).toLocaleString("ko-KR")}회/일)`
      : `조회수 ${formatViews(v.view_count)}`;

  return `너는 YouTube 채널 운영 컨설턴트다.
사용자는 자신의 채널을 키우려고 이 영상을 벤치마크로 골랐고, **자막 전문(全文)을 보고** 이 영상이 왜 잘 됐는지를 구성·서사·언어 차원에서 분석해달라고 한다.

[분석 원칙]
- 댓글이나 메타데이터가 아닌 **자막 그 자체**에서 근거를 끌어내라.
- 시간대(타임스탬프)를 직접 인용하라. 예: "[0:08] 에서 '...' 라고 시작" 처럼.
- "재밌게 풀어냈다", "흥미롭게 구성됐다" 같은 추상 평가 금지. **어떤 기법으로** 그렇게 했는지 집어내라.
- 시청 유지(retention)와 클릭 후 만족(post-CTR satisfaction) 두 축으로 분석해라.
- 모든 발견은 사용자가 따라할 수 있는 **재현 가능한 공식**으로 변환하라.

[영상 정보]
- 제목: ${v.title}
- 채널: ${v.channel_name ?? "알 수 없음"}
- ${viewLine}
- 영상 길이: ${formatDuration(v.duration_seconds)}
- 업로드: ${v.upload_date?.slice(0, 10) ?? "-"} (${dayInfo})

[자막 ${transcript.language ? `(${transcript.language})` : ""}] 총 ${transcript.segment_count}개 세그먼트 중 ${lines.length}개 사용
${transcriptBlock}

---

다음 7개 섹션으로 답하라. 각 섹션 **타임스탬프 인용 최소 2개** 필수.

## 1. 훅 분석 (첫 30초의 시청자 잡기 기법)
- 첫 멘트의 **약속/미스터리/충격/공감** 중 어느 트리거를 썼는가
- 시청자에게 **무엇을 약속**하는가 (구체 한 줄)
- 30초 안에 **이탈을 막는 장치** 1~2개 (질문 던지기, 결과 미리보기, 정체성 호명 등)
- 인용: "[시간] '문장'"

## 2. 본론 전개 구조
- 영상 전체 흐름을 **3~5개 단계**로 분해 (각 단계의 시작 타임스탬프 + 한 줄 요약)
- 각 단계 사이의 **전환 기법** (반전, 질문, 시각자료, 대비)
- **정보 밀도** 평가 (한 단위 시간당 정보량이 얼마나 빡빡한지)

## 3. 시청 유지 장치 (이탈 방지 메커니즘)
- 중간 이탈을 막는 **재호기심 유발** 순간 3개 (타임스탬프 + 어떤 표현)
- "곧 알려드릴게요", "결론은 마지막에" 같은 **미끼 사용** 빈도와 패턴
- 시각/청각 변화로 인지 자원을 흔드는 순간 (있으면)

## 4. 언어·말투 패턴
- 화자의 **톤** (전문가/친근/유머/냉소 등)
- 자주 쓰는 **레토릭 장치** (대비, 과장, 반복, 비유)
- 시청자와의 거리감을 만드는 호칭/지시어 패턴

## 5. 클라이맥스·반전 포인트
- 영상에서 **가장 결정적인 한 순간** (타임스탬프 + 왜 결정적인가)
- 이 순간이 시청 유지율을 잡았을 가능성을 자막 근거로 추정

## 6. 마무리·CTA 분석
- 마지막 30초의 **마무리 기법** (다음 영상 예고, 구독 유도, 질문 던지기 등)
- 시청자를 **다음 행동**으로 보내는 구체적 표현 인용
- 다음 영상으로의 자연스러운 연결 시도가 있는가

## 7. 내가 훔쳐 쓸 7가지 (재현 가능한 공식)
표 형식:
| # | 기법 | 이 영상의 적용 사례 (타임스탬프) | 내 영상에 어떻게 적용 |
|---|---|---|---|
| 1 | ... | ... | ... |
- 7개 모두 자막에서 직접 관찰된 것만
- "내 영상 적용"은 사용자 주제에 무관하게 일반화된 한 줄

---

전체를 한국어로. 서론·마무리 없이 바로 섹션부터.`;
}

export function buildSynthesisPrompt(
  videos: Video[],
  thumbnailVideoIds: string[],
): string {
  if (videos.length === 0) throw new Error("영상이 없습니다");
  const stats = computeSynthesisStats(videos);
  const statsBlock = formatStatsForPrompt(stats);
  const listBlock = formatVideoListForPrompt(videos);

  const thumbnailNote =
    thumbnailVideoIds.length > 0
      ? `\n[썸네일 이미지] 첨부된 ${thumbnailVideoIds.length}개 썸네일은 다음 영상들의 것이다 (이미지 첨부 순서 = 아래 순서):
${thumbnailVideoIds
  .map((id, i) => {
    const v = videos.find((x) => x.id === id);
    return `이미지 ${i + 1}: "${v?.title ?? id}"`;
  })
  .join("\n")}`
      : "\n[썸네일 이미지] 없음";

  return `너는 YouTube 채널 운영 컨설턴트다. 사용자는 자신의 채널을 키우려고 ${videos.length}개의 벤치마크 영상을 모았다.
이제 이 영상들을 한 번에 분석해서 **이 분야에서 통하는 공통 패턴**을 뽑아달라고 한다.

[분석 원칙]
- 표본 1개가 아닌 ${videos.length}개의 **공통점·반복 패턴**에만 집중하라. 한 영상 단독 분석 금지.
- 통계로 드러난 사실을 우선 인용하고, 그 다음 정성적 패턴을 추가하라.
- 추측은 "추정", 관찰된 사실은 단정적으로 구분.
- 모든 패턴은 **사용자가 자기 영상에서 따라할 수 있는 공식**으로 변환하라.

${statsBlock}

[영상 목록]
${listBlock}
${thumbnailNote}

---

다음 6개 섹션으로 답하라. 각 섹션에 **최소 3개 패턴**, 각 패턴마다 통계 수치 또는 영상 인용 포함.

## 1. 제목 공식 (이 분야에서 통하는 제목 패턴)
- 자주 등장하는 **구조** (예: "X가지 방법", "충격! ...", "왜 ...인가", 숫자+명사+이유)
- 자주 쓰는 **단어/감정 트리거** (놀람, 호기심, 권위, 금기, 시간 압박)
- **길이 패턴** (평균/중앙값 기준 권장 글자수 범위)
- 통계에서 드러난 강한 신호 (예: 70% 이상 숫자 사용 등) 우선

## 2. 썸네일 공통점 (첨부 이미지 기반)
- **인물·표정 패턴**: 얼굴 유무, 시선 방향, 표정 강도
- **색상 팔레트**: 자주 보이는 색 조합·대비
- **텍스트 오버레이**: 글자 크기·위치·길이·색상 패턴
- **레이아웃**: 1인/2인, 상품/캡처/일러스트 사용 빈도
- (이미지가 없으면 "썸네일 데이터 부족" 명시)

## 3. 영상 길이 분포 분석
- 통계의 **분포 모양**을 해석 (롱테일? 양극화? 한 구간 집중?)
- 이 분야의 **표준 길이 범위** 추천 (평균·중앙값 기반)
- 길이별로 다른 콘텐츠 유형이 보이는지 (짧으면 X형, 길면 Y형)

## 4. 업로드 타이밍 패턴
- 요일 분포에서 가장 강한 신호 1~2개
- 시간대 분포에서 신호 (오전/오후/저녁 어디 집중)
- 사용자가 따라할 권장 업로드 슬롯

## 5. 조회수 분포와 성공 영상 특징
- 평균/중앙값 차이로 **양극화 정도** 평가
- 조회수 상위 영상들의 공통점 (제목/길이/타이밍 측면) — 통계 + 영상 인용
- 평균 미달 영상들의 공통 약점

## 6. 내가 첫 영상에서 따라할 5개 액션
표 형식으로:
| # | 액션 | 근거 (위 어느 섹션) | 예시 |
|---|---|---|---|
| 1 | ... | ... | ... |
- 액션은 **즉시 실행 가능한 한 줄**로
- 예시는 사용자 채널에서 어떻게 적용할지 구체적 한 줄

---

전체를 한국어로. 서론·마무리 없이 바로 섹션부터.`;
}

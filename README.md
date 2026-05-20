# YouTube 벤치마킹 Studio

로컬에서 혼자 쓰는 개인용 YouTube 리서치 대시보드. 참고 영상을 모으고, 조회수 스냅샷·댓글·자막·썸네일을 바탕으로 Claude/ChatGPT/Gemini 분석을 붙여 다음 영상 아이디어를 뽑는 도구다.

## 시작하기

```bash
npm install
cp .env.local.example .env.local    # 사용할 LLM의 키만 채우면 됨
npm run dev
```

브라우저에서 http://localhost:3000 열기.

## 설치형 앱 빌드

현재 로컬 웹앱 사용 방식은 그대로 유지한다. 설치형 앱은 Electron으로 별도 포장하며, 실행 시 데이터가 OS별 앱 데이터 폴더에 저장된다.

```bash
npm run desktop:dev  # Electron 창으로 개발 실행
npm run dist:mac     # macOS 설치 파일 생성
npm run dist:win     # Windows 설치 파일 생성
```

GitHub에 `v0.1.0` 같은 태그를 푸시하거나 GitHub Actions에서 `Desktop Release` 워크플로를 수동 실행하면 macOS/Windows 빌드 산출물을 artifact로 받을 수 있다.

설치형 앱 데이터 위치:

- macOS: `~/Library/Application Support/YouTube Benchmark Studio/data`
- Windows: `%APPDATA%/YouTube Benchmark Studio/data`

기존 로컬 웹앱의 `data/videos.db`를 설치형 앱으로 옮기려면 설정 화면의 DB 백업/복원을 사용한다.

## 주요 흐름

1. 키워드 리서치에서 주제 후보를 찾는다.
2. YouTube 검색으로 넘어가 후보 영상을 찾는다.
3. 마음에 드는 영상을 벤치마킹 목록에 추가한다.
4. 상세 화면에서 댓글·자막·조회수 스냅샷을 수집한다.
5. LLM 분석/댓글 인사이트/스크립트 분석/종합 분석으로 패턴을 뽑는다.

## 주요 기능

- URL 한 줄 입력 → 참고 영상 자동 저장
- YouTube 검색: 기간·길이·구독자·지역 필터, 테이블/카드 뷰, 다중 선택 저장
- 키워드 리서치: Google Trends, Google/YouTube 자동완성, Naver 검색광고 월간 검색량
- 영상 상세: 썸네일, 메타데이터, 내 메모, 내 태그, 설명, 다운로드
- 댓글 수집: YouTube Data API v3 기반 댓글/답글 저장
- 자막 수집: 영상 스크립트 저장 후 훅·전개·시청 유지 분석
- 조회수 스냅샷: 시간별 조회수 변화와 노출 확률 추적
- LLM 분석: Claude/ChatGPT/Gemini 제공자별 결과 캐시
- 종합 분석: 여러 영상을 묶어 제목 공식, 썸네일 패턴, 길이, 업로드 타이밍 도출
- 설정 화면: API 키/모델 관리, YouTube 계정 연결, DB 백업/복원

## 기술 스택

- Next.js 15 (App Router), TypeScript, Tailwind v4
- `youtubei.js` — API 키 없이 YouTube 메타데이터 추출
- `better-sqlite3` — `data/videos.db`에 로컬 저장
- 썸네일 로컬 캐시 — `data/thumbnails/`

## 데이터와 백업

- `data/videos.db` — 영상/태그/분석 결과
- `data/thumbnails/{videoId}.jpg` — 썸네일 원본

`data/videos.db`에는 설정 화면에서 저장한 API 키도 들어간다. 혼자 로컬에서 쓰는 용도라면 편하지만, 폴더를 통째로 공유하거나 클라우드에 올릴 때는 이 파일을 특히 조심해야 한다.

백업은 설정 화면의 `DB 백업 다운로드`를 쓰면 된다. 복원은 설정 화면에서 `.db` 파일을 선택해 올리면 현재 DB가 교체된다. 복원 직전 기존 DB는 `data/videos-before-restore-*.db`로 한 번 더 남긴다.

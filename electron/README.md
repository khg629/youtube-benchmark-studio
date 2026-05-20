# Desktop Packaging

이 폴더는 기존 로컬 웹앱을 건드리지 않고 설치형 앱으로 감싸기 위한 Electron 런처입니다.

- 일반 개발: `npm run dev` 그대로 사용, 데이터는 `./data`
- 설치형 앱: Electron이 같이 포장된 Node 런타임으로 내부 Next 서버를 띄우고, `YTB_DATA_DIR`를 앱 데이터 폴더로 지정
  - macOS: `~/Library/Application Support/YouTube Benchmark Studio/data`
  - Windows: `%APPDATA%/YouTube Benchmark Studio/data`

설치형 앱은 각 사용자 컴퓨터에 독립 DB를 만들기 때문에, 현재 개발 폴더의 `data/videos.db`를 자동으로 가져가지 않습니다. 필요한 경우 웹앱 설정 화면의 DB 백업/복원 기능으로 옮기면 됩니다.

## GitHub Release

태그를 푸시하면 `.github/workflows/release-desktop.yml`이 macOS/Windows 빌드를 각각 만들고 GitHub Release에 설치 파일을 첨부합니다.

```bash
git tag v0.1.0
git push origin v0.1.0
```

서명/공증을 붙이지 않은 개인 배포판이므로 macOS Gatekeeper나 Windows SmartScreen 경고가 뜰 수 있습니다.

Next 서버가 런타임에 `.next`와 `node_modules`를 파일 시스템에서 직접 읽기 때문에 Electron `asar` 압축은 끕니다. `package.json`의 `build.asar=false`는 의도된 설정입니다.

SQLite 네이티브 모듈(`better-sqlite3`)은 Electron 프로세스가 아니라 같이 포장된 Node 프로세스에서 로드합니다. Electron은 창을 열고 로컬 서버를 관리하는 역할만 합니다.

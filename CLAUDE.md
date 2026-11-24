# 프로젝트 안내 (Claude용)

아이폰에서 플레이하는 웹 게임 프로젝트입니다. 사용자는 주로 휴대폰의 Claude 앱(Code 탭)으로 작업합니다.

## 구조
- `index.html` — 로비(닉네임 등록, 게임 선택, 게임별 전체 랭킹)
- `games/<id>.html` — 게임 하나당 파일 하나 (star, snake, jump, mole, brick, stack)
- `common.js` / `common.css` — 모든 게임이 같이 쓰는 기능: 게임 목록(`GAMES`), 닉네임(localStorage `name`), 효과음, Firebase 랭킹, 시작/일시정지/게임오버/랭킹 화면(`G.shell`)
- `firestore.rules` — Firebase 보안 규칙. 게임을 추가하면 `GAMES`의 `col`과 이 파일의 `rankingCols()`에 같이 추가하고, 사용자에게 Firebase 콘솔에서 규칙을 다시 게시하도록 안내합니다.
- 빌드 도구나 npm 패키지 없이 그대로 동작해야 합니다.
- `manifest.json`, `icon-180.png`, `icon-512.png` — 아이폰 "홈 화면에 추가" 시 앱처럼 보이게 하는 설정
- GitHub Pages로 `main` 브랜치 루트를 그대로 배포합니다.

## 작업 규칙
- 사용자와는 한국어로 대화합니다. 코딩 초보자일 수 있으니 쉽게 설명해 주세요.
- 모바일 우선: 터치 조작, 세로 화면, 작은 화면(약 390px 너비)에서 잘 보이는지 항상 고려합니다.
- 외부 라이브러리가 꼭 필요하면 CDN `<script>` 태그로 추가하고, 빌드 단계는 만들지 않습니다.
- `localStorage` 사용 시 try/catch로 감쌉니다.
- 작업이 끝나면 변경 사항을 `main` 브랜치에 바로 반영(merge)해서 사용자가 폰에서 곧바로 플레이해 볼 수 있게 합니다. 사용자가 PR을 원하면 PR로 진행합니다.
- 변경 후에는 사용자에게 "1~2분 뒤 게임 주소를 새로고침하면 반영돼요"라고 알려 줍니다.

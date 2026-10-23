# 오사카 여행 지도

개인별 비공개 여행 목록을 만들고 동행자에게 보기 또는 편집 링크를 공유하는 웹앱입니다. 지도에서 방문 일차별 동선을 볼 수 있습니다. 숙소와 여행 날짜는 나중에 추가할 수 있습니다.

## 커밋 메시지

새 커밋은 `[Feat]`, `[Fix]`, `[Refactor]`처럼 변경 유형을 제목 앞에 붙이고, 본문에 `- `로 시작하는 짧은 변경 내용을 적습니다. 전체 규칙은 [AGENTS.md](AGENTS.md)에 있습니다. 커밋 편집기에 템플릿을 표시하려면 저장소에서 `git config --local commit.template .gitmessage`를 실행하세요.

## 현재 기능

- ChatGPT 계정으로 로그인
- 계정별 비공개 여행 목록 여러 개 저장
- 보기 전용 링크 또는 편집 링크로 여행 목록과 연결된 동선을 함께 공유
- 동선 작성자 표시, 사람별 보기·편집 권한 변경 및 회수
- 한국어로 표시하는 Google Maps 지도와 Google Places 장소 검색
- 가게·숙소·관광지 저장, 지도 표시, 방문 일차와 순서 지정
- 영업시간, 메뉴 링크, 웹사이트, 메모 저장
- 장소 검색 API 키가 없을 때 지도에서 직접 위치를 골라 추가

## 개발 실행

```bash
cd /home/user/dev/osaka
npm install
npm run dev
```

브라우저에서 `http://localhost:5173`을 엽니다. 로컬 D1 DB를 새로 만드는 경우 먼저 빌드한 뒤 마이그레이션을 순서대로 적용합니다. 기존 DB에는 `0001`만 추가로 적용합니다.

```bash
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_faithful_giant_man.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_chilly_lucky_pierre.sql
```

## 자동 장소 검색

지도와 장소 검색은 모두 Google Maps Platform을 사용합니다. 검색은 브라우저의 Places Library `Place.searchByText()`를 호출하며, 한국어·일본 지역·오사카 주변을 기준으로 검색합니다. 다른 검색 서비스로 자동 전환하지 않습니다. 저장 시 Google Place ID로 영업시간과 웹사이트를 조회합니다.

- `GOOGLE_MAPS_API_KEY`: Google Maps JavaScript API와 Places API (New)를 활성화한 프로젝트의 브라우저용 키입니다. 기존 지도 키를 재사용합니다.
- Google Cloud에서 결제 계정을 연결하고, 키의 웹사이트 제한에 배포 도메인과 필요한 로컬 주소를 등록하세요. API 제한에는 Maps JavaScript API와 Places API (New)를 포함하세요.
- 로컬은 `.env`, 배포는 Sites 환경 변수에 설정합니다. 키 값은 소스와 Git에 커밋하지 마세요.

검색·상세 조회의 성공/실패 코드, 소요 시간, 결과 수, 문의 번호를 `/api/search-events`를 통해 Worker 로그에 기록합니다. 검색어·API 키·구글의 원문 오류 메시지는 로그에 보내지 않습니다. 이 기록은 브라우저가 보고한 진단 정보이며 인증 계층에서 차단된 요청은 포함되지 않을 수 있습니다.

## 공유와 배포

여행 목록은 기본적으로 소유자에게만 보입니다. 보기·편집 링크와 사용자별 여행 공유 권한은 연결된 동선에도 적용됩니다. 사이트에 접근 가능한 ChatGPT 계정으로 로그인해야 합니다. 공유 링크의 `#trip=...` 부분은 권한을 부여하므로 공개 게시하지 마세요. 같은 종류의 링크를 다시 만들면 기존 링크가 무효화됩니다.

동선에는 원래 작성자의 이메일과 현재 권한이 표시됩니다. **동선 공유 권한**에서 작성자는 사용자별로 보기 전용·편집 가능을 언제든 지정할 수 있습니다. 이 개별 설정은 여행 공유 및 링크 권한보다 우선합니다. 개별 설정을 해제하면 여행 공유 권한을 다시 따르며, 여행 권한이 없는 사용자는 동선 공유가 해제됩니다. 기존 동선만 공유했던 사용자는 보기 전용으로 유지됩니다.

편집자는 동선 이름·방문 순서·이동수단·요금·장소를 수정할 수 있습니다. 원작자는 유지되며 공유 권한 변경과 동선 전체 삭제는 작성자만 할 수 있습니다. 서버가 매 요청마다 권한을 확인하므로 권한 회수 후에는 이미 열어 둔 화면에서도 수정 요청이 차단됩니다. 화면으로 돌아오면 공유 목록과 권한을 다시 확인합니다.

## 로딩과 회귀 검사

초기 화면은 `/api/board?list=1&initial=1`에서 로그인 상태·여행 목록·선택한 여행을 함께 가져옵니다. 여행·동선의 상세 데이터는 권한 확인 후 D1 batch로 조회합니다. 장소 저장은 저장된 행을 반환해 화면에 즉시 반영합니다. 지도 키는 첫 페이지 응답에 포함하고, Places 라이브러리를 지도와 함께 준비합니다.

`npm test`는 임시 메모리 SQLite에 마이그레이션을 적용한 뒤 초기 조회, 공유 권한, 저장 결과, DB 호출 횟수와 지도 초기화 경로를 검사합니다. Node 22.13 이상이 필요하며 운영 데이터는 사용하지 않습니다.

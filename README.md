# 오사카 여행 지도

개인별 비공개 여행 목록을 만들고 동행자에게 보기 또는 편집 링크를 공유하는 웹앱입니다. 지도에서 방문 일차별 동선을 볼 수 있습니다. 숙소와 여행 날짜는 나중에 추가할 수 있습니다.

## 현재 기능

- 이메일·비밀번호로 회원가입 및 로그인 (비밀번호 10자 이상)
- 계정별 비공개 여행 목록 여러 개 저장
- 보기 전용 링크 또는 편집 링크로 동행자에게 목록 공유
- 한국어 지명을 우선 표시하는 OpenFreeMap 벡터 지도
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

키 없이도 Photon의 공개 검색 서비스를 사용해 장소를 찾을 수 있습니다. 작은 규모의 수동 검색에 적합하지만 응답 가능성과 검색 범위가 보장되지는 않습니다. 자주 찾는 한국어 지명은 한국어 이름으로 표시합니다. Photon 공개 서버는 `ko` 응답 언어를 지원하지 않으므로 모든 장소 이름과 주소가 한국어로 바뀌지는 않습니다. 저장한 장소의 이름과 주소는 상세 화면에서 직접 수정할 수 있습니다. 영업시간·웹사이트 자동 조회를 추가하려면 서버 환경 변수를 설정합니다.

- `GEOAPIFY_API_KEY`: 무료 요금제로 시작할 수 있는 장소·주소 검색. 등록된 영업시간과 웹사이트는 저장할 때 함께 가져옵니다. 정보가 없거나 변경되었으면 직접 수정할 수 있습니다. 메뉴 전체 목록은 제공되지 않으므로 메뉴 링크를 저장합니다.

키는 [Geoapify MyProjects](https://myprojects.geoapify.com/)에서 발급받습니다. `.env.example`을 `.env`로 복사한 뒤 값을 입력하고 개발 서버를 다시 시작합니다. 키를 브라우저 코드에 넣거나 Git에 커밋하지 마세요.

## 공유와 배포

여행 목록은 계정 소유자에게만 보입니다. **보기 링크**를 보내면 로그인 없이 읽을 수 있고, **편집 링크**를 보내면 로그인 없이 수정할 수 있습니다. 링크의 `#trip=...` 부분이 권한을 주므로 공개 게시하지 마세요. 같은 종류의 새 링크를 만들면 기존 링크가 무효화됩니다.

현재 이메일 확인과 비밀번호 재설정 기능은 없습니다. 공개 배포 전에 이 두 기능과 운영용 스팸 방어 수단을 추가하는 편이 좋습니다. 현재 개발 URL은 이 컴퓨터에서만 사용할 수 있습니다. 외부 URL 배포는 별도 단계입니다.

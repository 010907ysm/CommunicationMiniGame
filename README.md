# 제타유저들 소통방 미니게임

카카오 로그인, 별도 게임 닉네임, 실시간 참가자 목록, 초성게임/끝말잇기를 제공하는 Node.js + Socket.IO 웹앱입니다.

## 1. 로컬 실행

1. Node.js 20 이상 설치
2. 저장소 폴더에서 `npm install`
3. `.env.example`을 `.env`로 복사하고 값 입력
4. `npm start`
5. `http://localhost:3000` 접속

로컬에서는 `KAKAO_REDIRECT_URI`를 `http://localhost:3000/auth/kakao/callback`으로 설정하세요.

## 2. 카카오 로그인 설정

1. [Kakao Developers](https://developers.kakao.com/)에서 애플리케이션을 만듭니다.
2. 앱 설정에서 플랫폼 > Web에 배포 도메인(예: `https://내서비스.onrender.com`)을 등록합니다.
3. 카카오 로그인 > 활성화 설정을 ON으로 켭니다.
4. 카카오 로그인 > Redirect URI에 아래 주소를 정확히 등록합니다.
   `https://내서비스.onrender.com/auth/kakao/callback`
5. 앱 키에서 **REST API 키**를 확인합니다.
6. Render 환경변수에 다음 값을 등록합니다.
   - `KAKAO_REST_API_KEY`: 카카오 REST API 키
   - `KAKAO_REDIRECT_URI`: 위 Redirect URI와 완전히 동일한 주소
   - `SESSION_SECRET`: 충분히 길고 무작위인 비밀 문자열

카카오 동의항목에서 닉네임을 필수로 받을 필요는 없습니다. 이 서비스는 카카오 ID로 로그인만 확인하고, 실제 게임에는 사용자가 직접 정한 별도 닉네임을 표시합니다. 프로필 사진이나 카카오 프로필 이름은 게임 화면에 표시하지 않습니다.

## 3. GitHub 업로드 및 Render 배포

1. 이 프로젝트 파일을 GitHub 저장소에 업로드합니다.
2. Render에서 **New + > Web Service**를 선택하고 GitHub 저장소를 연결합니다.
3. `render.yaml`을 사용하는 Blueprint 배포 또는 아래 값으로 직접 설정합니다.
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Render 서비스가 생성되면 `https://...onrender.com` 주소를 확인합니다.
5. Render > Environment에 `KAKAO_REST_API_KEY`, `KAKAO_REDIRECT_URI`, `SESSION_SECRET`을 설정합니다.
6. `KAKAO_REDIRECT_URI`는 실제 Render 주소로 설정한 뒤, **Kakao Developers의 Redirect URI에도 똑같이 등록**합니다.
7. 배포 후 서비스 주소로 접속합니다.

## 4. 게임 규칙

- 게임방에 접속한 순서대로 참가자가 표시됩니다.
- 먼저 입장한 참가자가 방장입니다.
- 방장만 게임을 시작하고 재시작할 수 있습니다.
- 모든 참가자는 생명 3개로 시작합니다.
- 초성게임: 초성을 제안하고 투표한 뒤, 최다 득표 초성으로 진행합니다. 동률이면 초성 문자열의 가나다순으로 결정됩니다.
- 끝말잇기: 서버가 무작위 시작 단어를 선택합니다.
- 자기 차례에 한글 2~10자 단어를 제출합니다.
- 초성 불일치, 끝 글자 불일치, 이미 사용한 단어, 형식이 잘못된 단어는 생명 1개를 잃습니다.
- 생명이 0개가 되면 탈락하며, 최후의 1명이 우승합니다.

## 운영상 참고

- 현재 게임 상태와 참가자 목록은 서버 메모리에 저장됩니다. Render 인스턴스가 재시작되면 방과 게임 상태가 초기화됩니다. 무료 인스턴스의 절전/재시작에도 영향을 받을 수 있습니다.
- 여러 인스턴스로 확장하려면 Redis 어댑터와 영속 저장소를 추가해야 합니다. 우선 Render 인스턴스 1개로 운영하세요.
- 단어 검증은 한글 형식, 초성/끝말 규칙, 중복 여부를 확인하는 방식입니다. 별도 국어사전 API를 연결하지 않았으므로 실제 사전에 없는 단어인지까지 판정하지는 않습니다.
- 카카오 REST API 키와 세션 비밀값은 절대로 GitHub 코드에 올리지 말고 Render 환경변수로만 관리하세요.

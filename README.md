# TEST PRINT — VS Code 프로젝트 (로컬 PNG 자동 매핑 버전)

업로드해 주신 두 번째 ZIP의 **기존 레이아웃, 메뉴, 슬라이더, FRAME, PRINT, RESET**을 유지하면서
브라우저의 `UPLOAD PNG / REPLACE PNG` 기능을 제거하고 PNG를 정적 파일로 연결했습니다.

## 1. PNG 보관 위치

프로젝트의 `public/images/` 아래에 메뉴별 폴더를 만들었습니다.

| 메뉴 | 넣을 폴더 | 10개 파일명 (1~10프레임) |
| --- | --- | --- |
| 01 PUNCH | `public/images/punch/` | `punch--26.png` ~ `punch--35.png` |
| 02 POSITION | `public/images/position/` | `punch--36.png` ~ `punch--45.png` |
| 03 DENSITY | `public/images/density/` | `punch--56.png` ~ `punch--65.png` |
| 04 OVERLAP | `public/images/overlap/` | `punch--46.png` ~ `punch--55.png` |
| 05 CHARACTERISTIC | `public/images/characteristic/` | `punch--15.png` ~ `punch--24.png` |

**중요: 원래 적어주신 범위는 PUNCH `26~36` = 11장, POSITION `37~45` = 9장입니다.**
그래서 5개 메뉴의 **10프레임을 그대로 유지**하도록 `PUNCH 26~35`, `POSITION 36~45`로
서로 겹치지 않는 연속된 10개씩을 할당했습니다. 실제로 다른 파일을 쓰려면
**`src/lib/assetManifest.ts`의 `imageSets` 설정**을 편집하세요.

## 2. 이미지 배치 예

```text
TEST_PRINT/
├─ public/
│  └─ images/
│     ├─ punch/
│     │  ├─ punch--26.png  (FRAME 01)
│     │  ├─ punch--27.png  (FRAME 02)
│     │  └─ ... punch--35.png (FRAME 10)
│     ├─ position/
│     │  ├─ punch--36.png  (FRAME 01)
│     │  └─ ... punch--45.png (FRAME 10)
│     ├─ density/         (punch--56.png ~ punch--65.png)
│     ├─ overlap/         (punch--46.png ~ punch--55.png)
│     └─ characteristic/  (punch--15.png ~ punch--24.png)
├─ src/
│  ├─ App.tsx
│  ├─ lib/assetManifest.ts   <-- 수정할 파일 번호·폴더 매핑
│  ├─ components/
│  └─ index.css
├─ package.json
└─ vite.config.ts
```

정확한 파일명, 두 개의 하이픈(`--`), 소문자 확장자 `.png`를 지켜 주세요.
파일은 **웹 화면에 업로드하는 것이 아니라, VS Code로 연 프로젝트 폴더 안에 복사**해야 합니다.
브라우저 보안 제한 때문에 임의의 컴퓨터 내 경로(`C:\...` 등)에서 파일을 자동으로 읽을 수 없습니다.

## 3. VS Code 실행

터미널을 프로젝트 폴더에서 열고:

```bash
npm install
npm run dev
```

표시되는 로컬 주소(대개 `http://localhost:5173`)를 엽니다.
PNG 파일을 위 폴더에 복사한 다음 새로고침하면 자동으로 적용됩니다.
**Python 서버/데이터베이스는 필요하지 않습니다.**

배포용 빌드:

```bash
npm run build
```

`public/images/...`는 Vite 빌드 시 생성되는 `dist/images/...`로 복사됩니다.
실제 PNG 파일을 ZIP에 아직 포함하지 않았으므로, 파일을 추가하기 전에는
기본 예시 원형 그래픽이 표시됩니다.

## 4. 소스코드 변경점

- `src/App.tsx`: 이미지 선택을 고정 파일 URL로 연결; 업로드 버튼·파일 입력·API 통신 제거;
  선택한 PNG가 없다면 기본 원형 그래픽을 표시. 기존 PRINT/RESET·모든 슬라이더 유지.
- `src/lib/assetManifest.ts`: 메뉴별 10개 파일명과 경로를 정의한 **새 설정 파일**.
- `src/index.css`: 업로드 버튼 대신 선택 파일명을 작은 텍스트로 표시하도록 스타일만 수정.
- `backend/`, `data/`, `src/lib/api.ts`, `src/components/UploadButton.tsx`, 예전 빌드 `dist/`:
  더는 사용하지 않아 제거. 나머지 소스코드·폰트·설정은 원래대로 유지.

## 5. 주의할 점

- 브라우저가 입력한 PNG의 투명도를 보존합니다.
- 실제로 해당 경로에 파일이 없거나 파일명이 다르면 원형 예시 그래픽을 사용합니다.
- 우측 상단 `PRINT`는 선택한 PNG로 합성된 결과를 내려받습니다.
- PNG가 추가되었다면 새로고침 후 다시 테스트해 보세요.

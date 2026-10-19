/**
 * TEST PRINT 그래픽 파일 매핑 (각 메뉴별 정확히 10단계)
 *
 * 프로젝트의 `public/images/<folder>/` 안에 각 PNG를 넣으면 자동으로 표시됩니다.
 *
 * 원본 요청의 숫자 오류:
 *   PUNCH 26~36 = 11장, POSITION 37~45 = 9장입니다.
 * 10프레임을 유지하기 위해 PUNCH 26~35, POSITION 36~45로 보정했습니다.
 * 다른 매핑이 필요하면 아래 start 숫자만 바꾸거나 filenames 배열을 직접 편집하세요.
 */

export const menus = ['PUNCH', 'POSITION', 'DENSITY', 'OVERLAP', 'CHARACTERISTIC'] as const
export type MenuName = typeof menus[number]

const imageSets: Record<MenuName, { folder: string; start: number }> = {
  PUNCH:          { folder: 'punch',          start: 26 }, // punch--26.png ~ punch--35.png
  POSITION:       { folder: 'position',       start: 36 }, // punch--36.png ~ punch--45.png
  DENSITY:        { folder: 'density',        start: 56 }, // punch--56.png ~ punch--65.png
  OVERLAP:        { folder: 'overlap',        start: 46 }, // punch--46.png ~ punch--55.png
  CHARACTERISTIC: { folder: 'characteristic', start: 15 }, // punch--15.png ~ punch--24.png
}

export const FRAME_COUNT = 10

const baseUrl = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`

/** 순서(1~10)에 대응하는 이미지 파일명과 URL을 반환합니다. */
export function getFrameAsset(menu: MenuName, frame: number) {
  if (!Number.isInteger(frame) || frame < 1 || frame > FRAME_COUNT) {
    throw new Error(`Frame must be an integer between 1 and ${FRAME_COUNT}: ${frame}`)
  }
  const { folder, start } = imageSets[menu]
  const fileName = `punch--${start + frame - 1}.png`
  return { fileName, url: `${baseUrl}images/${folder}/${fileName}` }
}

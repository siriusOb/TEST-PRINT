
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import GraphicAsset from './components/GraphicAsset'
import FontLab from './FontLab'
import { getFrameAsset, menus, type MenuName } from './lib/assetManifest'
import './index.css'

type DrawBounds = { left: number; top: number; right: number; bottom: number }
type DensityLayout = { columns: number; rows: number }
type ReadyAsset = { url: string; width: number; height: number; bounds: DrawBounds }
type AssetResult = (ReadyAsset & { status: 'ready' }) | { url: string; status: 'missing' }

type NavigationMenu = 'FONT' | MenuName
type PrintBackground = 'background' | 'transparent'

const INDEX_FOLDER = new URL('images/index/', document.baseURI).pathname
const HERO_TITLE_URL = `${INDEX_FOLDER}punch-index-29.png`
const STUDY_TITLE_IMAGES: Record<NavigationMenu, { file: string; width: string }> = {
  FONT: { file: 'punch-index-35.png', width: '4.2em' },
  PUNCH: { file: 'punch-index-30.png', width: '5.2em' },
  POSITION: { file: 'punch-index-31.png', width: '7.8em' },
  DENSITY: { file: 'punch-index-32.png', width: '6.8em' },
  OVERLAP: { file: 'punch-index-33.png', width: '7.2em' },
  CHARACTERISTIC: { file: 'punch-index-34.png', width: '12.8em' },
}

const DENSITY_LAYOUTS: DensityLayout[] = [
  { columns: 1, rows: 1 },
  { columns: 2, rows: 1 },
  { columns: 3, rows: 1 },
  { columns: 2, rows: 2 },
  { columns: 3, rows: 2 },
  { columns: 4, rows: 2 },
  { columns: 3, rows: 3 },
  { columns: 4, rows: 3 },
  { columns: 5, rows: 3 },
  { columns: 4, rows: 4 },
  { columns: 5, rows: 4 },
  { columns: 6, rows: 4 },
  { columns: 5, rows: 5 },
  { columns: 7, rows: 4 },
  { columns: 6, rows: 5 },
  { columns: 7, rows: 5 },
  { columns: 6, rows: 6 },
  { columns: 8, rows: 5 },
  { columns: 7, rows: 6 },
  { columns: 8, rows: 6 },
  { columns: 7, rows: 7 },
  { columns: 10, rows: 5 },
]

const DEFAULTS = { sequence: 1, scale: 100, axisScale: 0, densityIndex: 3 }
const navigationMenus: readonly NavigationMenu[] = ['FONT', ...menus]
const CLUSTER_GAP = 8
const VISIBLE_BOUNDS: DrawBounds = { left: 0, top: 0, right: 1, bottom: 1 }

function studyTitleAsset(menu: NavigationMenu) {
  const item = STUDY_TITLE_IMAGES[menu]
  return { src: `${INDEX_FOLDER}${item.file}`, width: item.width }
}

function makeRows(layout: DensityLayout): number[][] {
  return Array.from({ length: layout.rows }, (_, rowIndex) =>
    Array.from({ length: layout.columns }, (_, colIndex) => rowIndex * layout.columns + colIndex + 1),
  )
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not load image: ${url}`))
    image.src = url
  })
}

function visibleImageBounds(image: HTMLImageElement): DrawBounds {
  const maxDimension = Math.max(image.naturalWidth, image.naturalHeight)
  if (!maxDimension) return { left: 0, top: 0, right: 1, bottom: 1 }
  const sampleScale = Math.min(1, 512 / maxDimension)
  const width = Math.max(1, Math.round(image.naturalWidth * sampleScale))
  const height = Math.max(1, Math.round(image.naturalHeight * sampleScale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return { left: 0, top: 0, right: 1, bottom: 1 }
  try {
    context.clearRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    const pixels = context.getImageData(0, 0, width, height).data
    let left = width, top = height, right = 0, bottom = 0
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (pixels[(y * width + x) * 4 + 3] < 3) continue
        left = Math.min(left, x)
        top = Math.min(top, y)
        right = Math.max(right, x + 1)
        bottom = Math.max(bottom, y + 1)
      }
    }
    if (left === width) return { left: 0, top: 0, right: 1, bottom: 1 }
    return { left: left / width, top: top / height, right: right / width, bottom: bottom / height }
  } catch {
    return { left: 0, top: 0, right: 1, bottom: 1 }
  }
}

// One shared image cache survives every React menu/frame change. Every URL is
// downloaded, decoded and measured at most once; multiple requests reuse the
// same in-flight Promise instead of starting a second image download.
const graphicAssetCache = new Map<string, AssetResult>()
const graphicAssetRequests = new Map<string, Promise<AssetResult>>()

function preloadGraphicAsset(url: string, priority: 'high' | 'low' = 'low'): Promise<AssetResult> {
  const cached = graphicAssetCache.get(url)
  if (cached) return Promise.resolve(cached)
  const pending = graphicAssetRequests.get(url)
  if (pending) return pending

  const request = new Promise<AssetResult>((resolve) => {
    const image = new Image()
    image.decoding = 'async'
    image.fetchPriority = priority
    let settled = false
    let decoding = false
    const finish = (result: AssetResult) => {
      if (settled) return
      settled = true
      image.onload = null
      image.onerror = null
      graphicAssetCache.set(url, result)
      resolve(result)
    }
    const onLoaded = () => {
      if (decoding || settled) return
      if (!image.naturalWidth || !image.naturalHeight) {
        finish({ status: 'missing', url })
        return
      }
      decoding = true
      // Decode off the main render path, so switching to this image doesn't
      // briefly expose an empty <img> while the browser decodes the PNG.
      void image.decode().catch(() => undefined).then(() => {
        finish({
          status: 'ready', url,
          width: image.naturalWidth,
          height: image.naturalHeight,
          bounds: visibleImageBounds(image),
        })
      })
    }
    image.onload = onLoaded
    image.onerror = () => finish({ status: 'missing', url })
    image.src = url
    if (image.complete && image.naturalWidth > 0) onLoaded()
  })
  graphicAssetRequests.set(url, request)
  void request.then(() => graphicAssetRequests.delete(url))
  return request
}

function preloadDecorativeImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image()
    image.decoding = 'async'
    image.fetchPriority = 'low'
    let settled = false
    let decoding = false
    const finish = () => {
      if (settled) return
      settled = true
      image.onload = null
      image.onerror = null
      resolve()
    }
    const onLoaded = () => {
      if (decoding || settled) return
      decoding = true
      void image.decode().catch(() => undefined).then(finish)
    }
    image.onload = onLoaded
    image.onerror = finish
    image.src = url
    if (image.complete && image.naturalWidth > 0) onLoaded()
  })
}

function drawFallback(context: CanvasRenderingContext2D, count: number, cell: number, primary: string) {
  const columns = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / columns)
  const dot = Math.min(46 / 76 * cell, (cell - 16) / columns)
  const step = Math.min((cell - 8) / columns, dot * 1.3)
  context.fillStyle = primary
  context.strokeStyle = '#000000'
  context.lineWidth = 1.5
  for (let i = 0; i < count; i += 1) {
    const x = ((i % columns) - (columns - 1) / 2) * step
    const y = (Math.floor(i / columns) - (rows - 1) / 2) * step
    context.beginPath()
    context.arc(x, y, dot * 0.45, 0, Math.PI * 2)
    context.fill()
    context.stroke()
  }
}

export default function App() {
  const [activeMenu, setActiveMenu] = useState<NavigationMenu>('PUNCH')
  const graphicMenu: MenuName = activeMenu === 'FONT' ? 'PUNCH' : activeMenu
  const [sequence, setSequence] = useState(DEFAULTS.sequence)
  const [scale, setScale] = useState(DEFAULTS.scale)
  const [axisScale, setAxisScale] = useState(DEFAULTS.axisScale)
  const [densityIndex, setDensityIndex] = useState(DEFAULTS.densityIndex)
  const [exporting, setExporting] = useState(false)
  // Shared across all six studies; default retains the original gray print.
  const [printBackground, setPrintBackground] = useState<PrintBackground>('background')
  const activeSlider = useRef<'form' | 'axis' | 'density' | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState({ width: 1050, height: 520 })
  const [lastReadyAssets, setLastReadyAssets] = useState<Partial<Record<MenuName, ReadyAsset>>>({})
  // Keep the previous artwork visible until the next decoded PNG is ready.
  // This avoids the blank gray frame when switching to an uncached menu.
  const lastDisplayedAsset = useRef<ReadyAsset | undefined>(undefined)
  const [assetResults, setAssetResults] = useState<Record<string, AssetResult>>({})

  const frameAsset = getFrameAsset(graphicMenu, sequence)
  const currentResult = assetResults[frameAsset.url] ?? graphicAssetCache.get(frameAsset.url)
  const imageStatus = currentResult?.status ?? 'loading'
  const displayedAsset = currentResult?.status === 'ready'
    ? currentResult
    : currentResult?.status === 'missing'
      ? undefined
      : (lastReadyAssets[graphicMenu] ?? lastDisplayedAsset.current)
  const selectedSource = displayedAsset?.url
  useEffect(() => {
    if (currentResult?.status === 'ready') lastDisplayedAsset.current = currentResult
  }, [currentResult])
  const showFallback = imageStatus === 'missing'
  const density = DENSITY_LAYOUTS[densityIndex]
  const copies = density.columns * density.rows
  const rows = useMemo(() => makeRows(density), [density])
  const columns = density.columns
  const baseCellSize = copies > 35 ? 51 : copies > 20 ? 64.5 : copies > 10 ? 84 : 114
  const cellSize = Math.max(12, Math.min(
    baseCellSize,
    (stageSize.width - 56 - CLUSTER_GAP * (columns - 1)) / columns,
    (stageSize.height - 100 - CLUSTER_GAP * (rows.length - 1)) / rows.length,
  ))
  const horizontalScale = axisScale >= 0 ? 1 + axisScale / 100 : 1
  const verticalScale = axisScale <= 0 ? 1 + Math.abs(axisScale) / 100 : 1
  const scaleX = (scale / 100) * horizontalScale
  const scaleY = (scale / 100) * verticalScale
  const maxNaturalSize = displayedAsset ? Math.max(displayedAsset.width, displayedAsset.height, 1) : 1
  const assetWidth = cellSize * (displayedAsset ? displayedAsset.width / maxNaturalSize : 1) * scaleX
  const assetHeight = cellSize * (displayedAsset ? displayedAsset.height / maxNaturalSize : 1) * scaleY
  const imageBounds = displayedAsset?.bounds ?? VISIBLE_BOUNDS
  const artworkCenterX = (imageBounds.left + imageBounds.right) / 2
  const artworkCenterY = (imageBounds.top + imageBounds.bottom) / 2
  const artworkOffsetX = (0.5 - artworkCenterX) * assetWidth
  const artworkOffsetY = (0.5 - artworkCenterY) * assetHeight
  const clusterStyle = {
    '--cell-size': `${cellSize}px`,
    '--asset-width': `${assetWidth}px`,
    '--asset-height': `${assetHeight}px`,
    '--asset-offset-x': `${artworkOffsetX}px`,
    '--asset-offset-y': `${artworkOffsetY}px`,
  } as CSSProperties

  useEffect(() => {
    const url = frameAsset.url
    let active = true
    // Subscription works whether preloading has already finished or not.
    // The cache is shared by all five menus and all ten sequence frames.
    void preloadGraphicAsset(url, 'high').then((result) => {
      if (!active) return
      setAssetResults((previous) => previous[url] === result ? previous : { ...previous, [url]: result })
      if (result.status === 'ready') {
        setLastReadyAssets((previous) => previous[graphicMenu] === result
          ? previous : { ...previous, [graphicMenu]: result })
        lastDisplayedAsset.current = result
      }
    })
    return () => { active = false }
  }, [graphicMenu, frameAsset.url])

  useEffect(() => {
    let active = true
    let backgroundTimer: ReturnType<typeof setTimeout> | undefined

    // Small menu headings are warmed immediately so the title doesn't flash
    // when the user clicks another study.
    for (const study of navigationMenus) {
      void preloadDecorativeImage(studyTitleAsset(study).src)
    }

    // Fetch the initially selected frame in EVERY graphic section first. This
    // makes first-time navigation responsive without waiting for a menu click.
    const firstFrames = menus.map((menu) => getFrameAsset(menu, DEFAULTS.sequence).url)
    void Promise.all(firstFrames.map((url) => preloadGraphicAsset(url))).then(() => {
      if (!active) return
      backgroundTimer = setTimeout(() => {
        if (!active) return
        // Limit concurrent background downloads and alpha-bound scans so the
        // current stage and sliders remain responsive on slower devices.
        const likelyNextFrames = menus.flatMap((menu) =>
          [2, 3].map((frame) => getFrameAsset(menu, frame).url),
        )
        const remainingGraphics = menus.flatMap((menu) =>
          Array.from({ length: 7 }, (_, index) => getFrameAsset(menu, index + 4).url),
        )
        const fontFolder = new URL('images/font/', document.baseURI).pathname
        const fontPngs = Array.from({ length: 27 }, (_, index) =>
          `${fontFolder}punch-font-${String(index + 2).padStart(2, '0')}.png`,
        )
        const queue: Array<() => Promise<unknown>> = [
          ...likelyNextFrames.map((url) => () => preloadGraphicAsset(url)),
          ...fontPngs.map((url) => () => preloadDecorativeImage(url)),
          () => preloadDecorativeImage(`${INDEX_FOLDER}punch-index-36.png`),
          ...remainingGraphics.map((url) => () => preloadGraphicAsset(url)),
        ]
        let next = 0
        const worker = async () => {
          while (active && next < queue.length) {
            const item = queue[next++]
            await item()
          }
        }
        void Promise.all([worker(), worker(), worker()])
      }, 250)
    })

    return () => {
      active = false
      if (backgroundTimer !== undefined) clearTimeout(backgroundTimer)
    }
  }, [])

  useEffect(() => {
    const node = stageRef.current
    if (!node) return
    const measure = () => {
      const { width, height } = node.getBoundingClientRect()
      if (width && height) setStageSize({ width, height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // Give the home positions a light magnetic stop when approaching by pointer.
  // Moving away from a home position is never blocked; arrow keys stay precise.
  const homeSnap = (next: number, previous: number, home: number, threshold: number, control: 'form' | 'axis' | 'density') => {
    if (activeSlider.current !== control) return next
    const distance = Math.abs(next - home)
    // Default values behave as a light magnetic notch during a pointer drag.
    // Dragging beyond the small notch always releases it; keyboard remains precise.
    if (previous === home) return distance <= threshold ? home : next
    if (distance <= threshold && distance < Math.abs(previous - home)) return home
    if ((previous - home) * (next - home) < 0 && distance <= threshold * 1.5) return home
    return next
  }
  const endSliderDrag = () => { activeSlider.current = null }

  const resetControls = () => {
    setSequence(DEFAULTS.sequence)
    setScale(DEFAULTS.scale)
    setAxisScale(DEFAULTS.axisScale)
    setDensityIndex(DEFAULTS.densityIndex)
  }

  const randomizeControls = () => {
    // Moderate variations around a readable base, rather than extreme slider ends.
    const pick = (min: number, max: number, step = 1) =>
      min + Math.floor(Math.random() * (Math.round((max - min) / step) + 1)) * step
    setSequence(pick(1, 10))
    setScale(pick(80, 145, 5))
    setAxisScale(pick(-60, 60, 5))
    setDensityIndex(pick(2, 9))
  }

  const chooseMenu = (menu: NavigationMenu) => {
    // Preserve IMAGE SEQUENCE across all graphic studies. The new menu's PNG
    // is selected by its URL automatically, even if the number did not change.
    setActiveMenu(menu)
  }

  const chooseWheelFrame = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const dx = event.clientX - (rect.left + rect.width / 2)
    const dy = event.clientY - (rect.top + rect.height / 2)
    if (Math.hypot(dx, dy) < rect.width * 0.09) return
    const angle = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2)
    setSequence(Math.min(10, Math.floor(angle / (2 * Math.PI / 10)) + 1))
  }
  const onWheelPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    chooseWheelFrame(event)
  }
  const onWheelPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) chooseWheelFrame(event)
  }
  const onWheelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault(); setSequence((value) => value === 10 ? 1 : value + 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault(); setSequence((value) => value === 1 ? 10 : value - 1)
    } else if (event.key === 'Home') { event.preventDefault(); setSequence(1) }
    else if (event.key === 'End') { event.preventDefault(); setSequence(10) }
  }

  const exportPng = async (backgroundMode: PrintBackground) => {
    if (exporting) return
    setExporting(true)
    try {
      let image: HTMLImageElement | null = null
      try { image = await loadImage(frameAsset.url) } catch { image = null }

      const layout = density
      const exportCell = cellSize
      const gridStep = exportCell + CLUSTER_GAP
      const visibleBounds = image ? visibleImageBounds(image) : VISIBLE_BOUNDS
      const imageMaxSize = image ? Math.max(image.naturalWidth, image.naturalHeight, 1) : 1
      const imageWidth = image ? exportCell * image.naturalWidth / imageMaxSize * scaleX : exportCell * scaleX
      const imageHeight = image ? exportCell * image.naturalHeight / imageMaxSize * scaleY : exportCell * scaleY
      const artworkCenterX = (visibleBounds.left + visibleBounds.right) / 2
      const artworkCenterY = (visibleBounds.top + visibleBounds.bottom) / 2

      const fallbackColumns = Math.ceil(Math.sqrt(sequence))
      const fallbackRows = Math.ceil(sequence / fallbackColumns)
      const fallbackDot = Math.min(46 / 76 * exportCell, (exportCell - 16) / fallbackColumns)
      const fallbackStep = Math.min((exportCell - 8) / fallbackColumns, fallbackDot * 1.3)
      const fallbackWidth = ((fallbackColumns - 1) * fallbackStep + fallbackDot * 0.9) * scaleX
      const fallbackHeight = ((fallbackRows - 1) * fallbackStep + fallbackDot * 0.9) * scaleY
      const visibleLeft = image ? (visibleBounds.left - artworkCenterX) * imageWidth : -fallbackWidth / 2
      const visibleRight = image ? (visibleBounds.right - artworkCenterX) * imageWidth : fallbackWidth / 2
      const visibleTop = image ? (visibleBounds.top - artworkCenterY) * imageHeight : -fallbackHeight / 2
      const visibleBottom = image ? (visibleBounds.bottom - artworkCenterY) * imageHeight : fallbackHeight / 2

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (let row = 0; row < layout.rows; row += 1) {
        for (let col = 0; col < layout.columns; col += 1) {
          const centerX = col * gridStep + exportCell / 2
          const centerY = row * gridStep + exportCell / 2
          minX = Math.min(minX, centerX + visibleLeft)
          maxX = Math.max(maxX, centerX + visibleRight)
          minY = Math.min(minY, centerY + visibleTop)
          maxY = Math.max(maxY, centerY + visibleBottom)
        }
      }

      const contentWidth = Math.max(1, maxX - minX)
      const contentHeight = Math.max(1, maxY - minY)
      const paddingX = Math.max(8, contentWidth * 0.08)
      const paddingY = Math.max(8, contentHeight * 0.08)
      const renderWidth = contentWidth + paddingX * 2
      const renderHeight = contentHeight + paddingY * 2
      const exportRatio = Math.min(
        4,
        4096 / renderWidth,
        4096 / renderHeight,
        Math.sqrt(12_000_000 / (renderWidth * renderHeight)),
      )
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(renderWidth * exportRatio))
      canvas.height = Math.max(1, Math.round(renderHeight * exportRatio))
      const context = canvas.getContext('2d')
      if (!context) return
      const styles = getComputedStyle(document.documentElement)
      const background = styles.getPropertyValue('--color-surface-2').trim() || '#B4BDCC'
      const primary = styles.getPropertyValue('--color-primary').trim() || '#001EF7'
      if (backgroundMode === 'background') {
        context.fillStyle = background
        context.fillRect(0, 0, canvas.width, canvas.height)
      }
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.setTransform(exportRatio, 0, 0, exportRatio, (paddingX - minX) * exportRatio, (paddingY - minY) * exportRatio)

      for (let row = 0; row < layout.rows; row += 1) {
        for (let col = 0; col < layout.columns; col += 1) {
          const centerX = col * gridStep + exportCell / 2
          const centerY = row * gridStep + exportCell / 2
          context.save()
          context.translate(centerX, centerY)
          if (image) {
            context.drawImage(
              image,
              -artworkCenterX * imageWidth,
              -artworkCenterY * imageHeight,
              imageWidth,
              imageHeight,
            )
          } else {
            context.scale(scaleX, scaleY)
            drawFallback(context, sequence, exportCell, primary)
          }
          context.restore()
        }
      }
      const link = document.createElement('a')
      link.download = `${activeMenu.toLowerCase()}-frame-${String(sequence).padStart(2, '0')}-${backgroundMode}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (error) {
      console.error('PNG export failed:', error)
      window.alert('PNG 내보내기에 실패했습니다. 콘솔을 확인해 주세요.')
    } finally {
      setExporting(false)
    }
  }

  const activeTitle = studyTitleAsset(activeMenu)
  const activeIndex = String(navigationMenus.indexOf(activeMenu)).padStart(2, '0')

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="wordmark-wrap"><span className="accent-mark" aria-hidden="true" /><span className="wordmark">IMAGE LAB</span></div>
        <span className="header-index tabular">TEST PRINT <span className="header-divider">/</span> PUNCH YOUR TRACE</span>
        <span className="header-edition tabular"><span className="header-edition-dot" aria-hidden="true">·</span><span>COM</span></span>
      </header>
      <main>
        <section className="hero-grid">
          <p className="eyebrow">INTERACTIVE<br />GRAPHIC SYSTEM</p>
          <h1 aria-label="TEST PRINT"><img className="hero-title-image" src={HERO_TITLE_URL} alt="TEST PRINT" draggable={false} /></h1>
          <p className="hero-note">A PLAYGROUND FOR<br />VISUAL EXPERIMENTS</p>
        </section>
        <nav className="study-nav" aria-label="Experiment menu">
          {navigationMenus.map((menu, index) => (
            <button key={menu} type="button" className={activeMenu === menu ? 'is-active' : ''} onClick={() => chooseMenu(menu)} aria-current={activeMenu === menu ? 'page' : undefined}>
              <span className="tabular">{String(index).padStart(2, '0')}</span>
              <span className="menu-name">{menu}</span>
            </button>
          ))}
        </nav>
        <FontLab active={activeMenu === 'FONT'} printBackground={printBackground} onPrintBackgroundChange={setPrintBackground} />
        <section className="lab-layout" hidden={activeMenu === 'FONT'} aria-label={`${graphicMenu} composition`}>
          {/* Mobile-only PRINT, anchored to the top-right of the whole gray studio,
              above the IMAGE SEQUENCE wheel. Desktop PRINT stays untouched. */}
          <div className="preview-actions mobile-preview-actions" aria-label="Print settings (mobile)">
            <div className="print-dropdown">
              <button className="print-export-button" type="button" aria-haspopup="true"
                aria-label="PRINT: choose transparent or gray background" disabled={exporting}>
                {exporting ? 'EXPORTING…' : 'PRINT'}
              </button>
              <div className="print-dropdown-menu" role="group" aria-label="Choose PNG export background">
                <button className="print-format-button" type="button" aria-pressed={printBackground === 'transparent'} disabled={exporting}
                  onClick={() => { setPrintBackground('transparent'); void exportPng('transparent') }}>TRANSPARENT</button>
                <button className="print-format-button" type="button" aria-pressed={printBackground === 'background'} disabled={exporting}
                  onClick={() => { setPrintBackground('background'); void exportPng('background') }}>BACKGROUND</button>
              </div>
            </div>
          </div>
          <aside className="sequence-control" aria-label="Image sequence">
            <div className="study-inline-title">
              <strong className="study-inline-number tabular">{activeIndex}</strong>
              <h2 className="study-inline-name" aria-label={activeMenu}>
                <img className="study-name-image" src={activeTitle.src} alt={activeMenu} draggable={false} />
              </h2>
            </div>
            <div className="sequence-label">
              <span>IMAGE SEQUENCE</span>
              <small className="sequence-instruction">CLICK &amp; DRAG</small>
            </div>
            <div className="sequence-wheel-wrap">
              <div className="sequence-wheel" role="slider" tabIndex={0} aria-label="Image sequence" aria-valuemin={1} aria-valuemax={10} aria-valuenow={sequence} onPointerDown={onWheelPointerDown} onPointerMove={onWheelPointerMove} onKeyDown={onWheelKeyDown}>
                <svg className="wheel-graphic" viewBox="0 0 200 200" aria-hidden="true">
                  <circle className="wheel-base" cx="100" cy="100" r="94" />
                  {sequence === 10 ? <circle className="wheel-progress" cx="100" cy="100" r="94" /> : <path className="wheel-progress" d={`M100 100 L100 6 A94 94 0 ${sequence > 5 ? 1 : 0} 1 ${100 + 94 * Math.sin((sequence / 10) * Math.PI * 2)} ${100 - 94 * Math.cos((sequence / 10) * Math.PI * 2)} Z`} />}
                </svg>
              </div>
              <strong className="sequence-value tabular" aria-live="polite">{sequence}/10</strong>
            </div>
          </aside>
          <div className="lab-preview">
            <div className="preview-stage" ref={stageRef}>
              <div className="preview-actions" aria-label="Print settings">
                <div className="print-dropdown">
                  <button className="print-export-button" type="button" aria-haspopup="true" aria-label="PRINT: choose transparent or gray background" disabled={exporting}>{exporting ? 'EXPORTING…' : 'PRINT'}</button>
                  <div className="print-dropdown-menu" role="group" aria-label="Choose PNG export background">
                    <button className="print-format-button" type="button" aria-pressed={printBackground === 'transparent'} disabled={exporting}
                      onClick={() => { setPrintBackground('transparent'); void exportPng('transparent') }}>TRANSPARENT</button>
                    <button className="print-format-button" type="button" aria-pressed={printBackground === 'background'} disabled={exporting}
                      onClick={() => { setPrintBackground('background'); void exportPng('background') }}>BACKGROUND</button>
                  </div>
                </div>
              </div>
              <div className="cell-cluster" style={clusterStyle}>
                {rows.map((row, rowIndex) => (
                  <div className="cluster-row" key={rowIndex}>
                    {row.map((item) => (
                      <div key={item} className="cluster-cell">
                        <GraphicAsset source={selectedSource} showFallback={showFallback} count={sequence} alt={`${activeMenu} graphic ${item}`} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <section className="control-rail" aria-label="Graphic controls">
              <label className="rail-control form-control"><span>SCALE</span><strong className="tabular">{scale}%</strong><input aria-label="Scale" type="range" min="10" max="400" step="1" value={scale} style={{ '--fill-end': `${((scale - 10) / 390) * 100}%` } as CSSProperties} onPointerDown={() => { activeSlider.current = 'form' }} onPointerUp={endSliderDrag} onPointerCancel={endSliderDrag} onBlur={endSliderDrag} onChange={(event) => setScale((previous) => homeSnap(Number(event.target.value), previous, DEFAULTS.scale, 10, 'form'))} /><small>10 — 400%</small></label>
              <label className="rail-control axis-control"><span>VERTICAL — HORIZONTAL</span><strong className="tabular">{axisScale > 0 ? `H +${axisScale}%` : axisScale < 0 ? `V +${Math.abs(axisScale)}%` : '0%'}</strong><input aria-label="Vertical to horizontal scale" type="range" min="-260" max="260" step="5" value={axisScale} style={{ '--fill-start': axisScale < 0 ? `${50 + axisScale / 5.2}%` : '50%', '--fill-end': axisScale > 0 ? `${50 + axisScale / 5.2}%` : '50%' } as CSSProperties} onPointerDown={() => { activeSlider.current = 'axis' }} onPointerUp={endSliderDrag} onPointerCancel={endSliderDrag} onBlur={endSliderDrag} onChange={(event) => setAxisScale((previous) => homeSnap(Number(event.target.value), previous, DEFAULTS.axisScale, 15, 'axis'))} /><small>VERTICAL ← 0 → HORIZONTAL</small></label>
              <label className="rail-control density-control"><span>DENSITY</span><strong className="tabular">{String(copies).padStart(2, '0')}</strong><input aria-label="Density" aria-valuetext={`${copies} graphics, ${density.columns} columns × ${density.rows} rows`} type="range" min="0" max={DENSITY_LAYOUTS.length - 1} step="1" value={densityIndex} style={{ '--fill-end': `${(densityIndex / (DENSITY_LAYOUTS.length - 1)) * 100}%` } as CSSProperties} onPointerDown={() => { activeSlider.current = 'density' }} onPointerUp={endSliderDrag} onPointerCancel={endSliderDrag} onBlur={endSliderDrag} onChange={(event) => setDensityIndex((previous) => homeSnap(Number(event.target.value), previous, DEFAULTS.densityIndex, 1, 'density'))} /><small>01 — 50 / FULL GRID</small></label>
              <div className="graphic-actions">
                <button className="reset-trigger" type="button" onClick={resetControls}>RESET</button>
                <button className="random-trigger" type="button" onClick={randomizeControls}>RANDOM</button>
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  )
}

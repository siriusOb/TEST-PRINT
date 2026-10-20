
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import './font-lab.css'

type Alignment = 'LEFT' | 'CENTER' | 'RIGHT'
type PrintBackground = 'background' | 'transparent'
type FontGlyph = { char: string; x: number; y: number; width: number; height: number; url: string; id: number }
type CharacterBox = { index: number; x: number; y: number; width: number; height: number }
type SelectionRect = { x: number; y: number; width: number; height: number }

// Merge consecutive, selected characters on a line into one solid mint strip.
// The joined rectangle naturally covers TRACKING gaps and selected spaces,
// while starting a new strip at soft wraps or explicit newlines.
function selectionRects(boxes: CharacterBox[], start: number, end: number): SelectionRect[] {
  const result: SelectionRect[] = []
  let priorIndex = -2
  for (const box of boxes) {
    if (box.index < start || box.index >= end) continue
    const previous = result[result.length - 1]
    const right = box.x + box.width
    const sameLine = previous && Math.abs(previous.y - box.y) < 0.5
    if (previous && sameLine && box.index === priorIndex + 1) {
      const x0 = Math.min(previous.x, box.x)
      const x1 = Math.max(previous.x + previous.width, right)
      previous.x = x0
      previous.width = x1 - x0
    } else {
      result.push({ x: box.x, y: box.y, width: box.width, height: box.height })
    }
    priorIndex = box.index
  }
  return result
}
type CaretPosition = { x: number; y: number }
type FontLayout = {
  characterBoxes: CharacterBox[]
  carets: CaretPosition[]
  glyphs: FontGlyph[]
  width: number
  height: number
  lineCount: number
  caretX: number
  caretY: number
  caretHeight: number
}

const FONT_FOLDER = new URL('images/font/', document.baseURI).pathname
const INDEX_FOLDER = new URL('images/index/', document.baseURI).pathname
const TITLE_IMAGE = `${INDEX_FOLDER}punch-index-35.png`
const EMPTY_PROMPT_IMAGE = `${INDEX_FOLDER}punch-index-36.png`
const FONT_DEFAULTS = {
  size: 60,
  axis: 0,
  tracking: 0,
  leading: 0,
  alignment: 'LEFT' as Alignment,
}
const MAX_ALPHABETS_PER_LINE = 15
const TRACKING_RATIO = 0.13
const SPACE_RATIO = 0.5
const LEADING_RATIO = 0.5

function fontUrl(char: string) {
  const index = char === '.' ? 28 : char.charCodeAt(0) - 65 + 2
  return `${FONT_FOLDER}punch-font-${String(index).padStart(2, '0')}.png`
}

function sanitizeText(raw: string): string {
  return raw.toUpperCase().replace(/\r\n?/g, '\n').replace(/[^A-Z. \n]/g, '').slice(0, 6000)
}

// Wrap at spaces. A word is never split in the middle, even if it has more
// than 15 letters. Explicit Enter inserts a real line break.
type IndexedChar = { char: string; index: number }
type FontLine = { chars: IndexedChar[]; newlineIndex?: number }
function splitIntoLines(text: string): FontLine[] {
  const lines: FontLine[] = [{ chars: [] }]
  let lineLetters = 0
  let pendingSpaces: IndexedChar[] = []
  const tokens = /[A-Z.]+| +|\n/g
  for (const match of text.matchAll(tokens)) {
    const token = match[0]
    const index = match.index ?? 0
    if (token === '\n') {
      lines[lines.length - 1].chars.push(...pendingSpaces)
      pendingSpaces = []
      lines[lines.length - 1].newlineIndex = index
      lines.push({ chars: [] })
      lineLetters = 0
    } else if (token[0] === ' ') {
      pendingSpaces.push(...Array.from(token, (char, i) => ({ char, index: index + i })))
    } else {
      const count = (token.match(/[A-Z]/g) || []).length
      if (lineLetters > 0 && lineLetters + count > MAX_ALPHABETS_PER_LINE) {
        // The separating spaces belong to the preceding line, without
        // introducing an indent before the next word.
        lines[lines.length - 1].chars.push(...pendingSpaces)
        lines.push({ chars: [] })
        lineLetters = 0
      } else {
        lines[lines.length - 1].chars.push(...pendingSpaces)
      }
      pendingSpaces = []
      lines[lines.length - 1].chars.push(...Array.from(token, (char, i) => ({ char, index: index + i })))
      lineLetters += count
    }
  }
  lines[lines.length - 1].chars.push(...pendingSpaces)
  return lines
}

function makeFontLayout(text: string, size: number, axis: number, tracking: number, leading: number, alignment: Alignment, baseRatio: number): FontLayout {
  const nominalWidth = size * baseRatio
  const glyphWidth = nominalWidth * (axis < 0 ? 1 + Math.abs(axis) / 100 : 1)
  const glyphHeight = size * (axis > 0 ? 1 + axis / 100 : 1)
  const glyphGap = glyphWidth * TRACKING_RATIO * (1 + tracking)
  const spaceAdvance = glyphWidth * Math.max(0.02, SPACE_RATIO + TRACKING_RATIO * tracking)
  const lineGap = glyphHeight * LEADING_RATIO * (1 + leading)
  const lines = splitIntoLines(text)
  const prepared = lines.map((line) => {
    let cursor = 0
    let previousWasGlyph = false
    let minX = 0
    let maxX = 0
    const items: { char: string; x: number; width: number; index: number; before: number; after: number }[] = []
    for (const { char, index } of line.chars) {
      if (char !== ' ' && previousWasGlyph) cursor += glyphGap
      const before = cursor
      const width = char === ' ' ? spaceAdvance : glyphWidth
      cursor += width
      items.push({ char, x: before, width, index, before, after: cursor })
      minX = Math.min(minX, before)
      maxX = Math.max(maxX, cursor)
      previousWasGlyph = char !== ' '
    }
    return { items, minX, width: Math.max(0, maxX - minX), cursor, newlineIndex: line.newlineIndex }
  })
  const maximumLineWidth = Math.max(glyphWidth, ...prepared.map((line) => line.width))
  const glyphs: FontGlyph[] = []
  const characterBoxes: CharacterBox[] = []
  const carets: CaretPosition[] = Array.from({ length: text.length + 1 }, () => ({ x: 0, y: 0 }))
  const lineStep = glyphHeight + lineGap
  const lineOffsets = prepared.map(line => (alignment === 'LEFT' ? 0 : alignment === 'CENTER'
    ? (maximumLineWidth - line.width) / 2 : maximumLineWidth - line.width) - line.minX)
  prepared.forEach((line, lineIndex) => {
    const y = lineIndex * lineStep
    const xOffset = lineOffsets[lineIndex]
    if (lineIndex === 0) carets[0] = { x: xOffset, y }
    for (const item of line.items) {
      const x = item.x + xOffset
      carets[item.index] = { x, y }
      carets[item.index + 1] = { x: x + item.width + (item.char !== ' ' ? glyphGap : 0), y }
      characterBoxes.push({ index: item.index, x, y, width: Math.max(2, item.width), height: glyphHeight })
      if (item.char !== ' ') {
        glyphs.push({ char: item.char, x, y, width: glyphWidth, height: glyphHeight, url: fontUrl(item.char), id: item.index })
      }
    }
    if (line.newlineIndex !== undefined) {
      const index = line.newlineIndex
      const x = xOffset + line.cursor
      carets[index] = { x, y }
      characterBoxes.push({ index, x, y, width: Math.max(4, glyphWidth * .15), height: glyphHeight })
      carets[index + 1] = { x: lineOffsets[lineIndex + 1] ?? 0, y: (lineIndex + 1) * lineStep }
    }
    // At a soft wrap, the next character has the same logical index as this
    // line's trailing caret. Its position is supplied by the next line.
  })
  const endLine = prepared[prepared.length - 1]
  const lastPosition = {
    x: lineOffsets[prepared.length - 1] + endLine.cursor + (/[A-Z.]$/.test(text) ? glyphGap : 0),
    y: (prepared.length - 1) * lineStep,
  }
  if (text.length === 0) lastPosition.x = maximumLineWidth / 2
  carets[text.length] = lastPosition
  return {
    glyphs, characterBoxes, carets,
    width: maximumLineWidth,
    height: Math.max(1, (lines.length - 1) * lineStep + glyphHeight),
    lineCount: lines.length,
    caretX: lastPosition.x,
    caretY: lastPosition.y,
    caretHeight: glyphHeight,
  }
}

function fetchImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(url.split('/').pop() || url))
    image.src = url
  })
}

function Glyph({ glyph, factor }: { glyph: FontGlyph; factor: number }) {
  const [missing, setMissing] = useState(false)
  const style: CSSProperties = {
    left: glyph.x * factor,
    top: glyph.y * factor,
    width: glyph.width * factor,
    height: glyph.height * factor,
  }
  return (
    <span className="font-glyph" style={style}>
      {missing ? <span className="font-missing-glyph" title={`${glyph.url} not found`}>{glyph.char}</span> : (
        <img src={glyph.url} alt={glyph.char === '.' ? 'period' : glyph.char} draggable={false}
          decoding="async" onError={() => setMissing(true)} />
      )}
    </span>
  )
}

export default function FontLab({ active, printBackground, onPrintBackgroundChange }: {
  active: boolean
  printBackground: PrintBackground
  onPrintBackgroundChange: (next: PrintBackground) => void
}) {
  const [text, setText] = useState('')
  const [inputFocused, setInputFocused] = useState(false)
  const [selection, setSelection] = useState({ start: 0, end: 0 })
  const [fontSize, setFontSize] = useState(FONT_DEFAULTS.size)
  const [axis, setAxis] = useState(FONT_DEFAULTS.axis)
  const [tracking, setTracking] = useState(FONT_DEFAULTS.tracking)
  const [leading, setLeading] = useState(FONT_DEFAULTS.leading)
  const [alignment, setAlignment] = useState<Alignment>(FONT_DEFAULTS.alignment)
  const [referenceRatio, setReferenceRatio] = useState(0.76)
  const [exporting, setExporting] = useState(false)
  const [stageSize, setStageSize] = useState({ width: 900, height: 480 })
  const stageRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const compositionRef = useRef<HTMLDivElement>(null)
  const dragAnchor = useRef<number | null>(null)
  const draggingSlider = useRef(false)
  // Keyboard repeat is controlled here rather than relying on native macOS
  // press-and-hold character behavior, which may show an accent menu instead.
  const beginSliderDrag = () => { draggingSlider.current = true }
  const endSliderDrag = () => { draggingSlider.current = false }
  const snapToDefault = (value: number, initial: number, margin: number) =>
    draggingSlider.current && Math.abs(value - initial) <= margin ? initial : value

  const updateSelection = () => {
    const input = inputRef.current
    if (input) setSelection({ start: input.selectionStart, end: input.selectionEnd })
  }

  useEffect(() => {
    let valid = true
    const image = new Image()
    image.onload = () => {
      if (valid && image.naturalHeight) setReferenceRatio(image.naturalWidth / image.naturalHeight)
    }
    image.src = fontUrl('A')
    return () => { valid = false; image.onload = null }
  }, [])

  useEffect(() => {
    const node = stageRef.current
    if (!node) return
    const measure = () => {
      const rect = node.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) setStageSize({ width: rect.width, height: rect.height })
    }
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(node)
    return () => resize.disconnect()
  }, [])

  // Handle physical keyboard repeats in one place. Ctrl/Cmd+A selects the
  // underlying text (PNG glyphs are only the visual representation). Typing or
  // Backspace replaces the selection, as in a normal text editor.
  useEffect(() => {
    if (!active) return
    let heldKey: string | null = null
    let repeatDelay: ReturnType<typeof setTimeout> | null = null
    let repeatTimer: ReturnType<typeof setInterval> | null = null

    const stopRepeat = () => {
      if (repeatDelay !== null) clearTimeout(repeatDelay)
      if (repeatTimer !== null) clearInterval(repeatTimer)
      repeatDelay = null
      repeatTimer = null
      heldKey = null
    }
    const normalizeKey = (key: string): string | null => {
      if (/^[a-zA-Z.]$/.test(key)) return key.toUpperCase()
      if (key === ' ' || key === 'Spacebar') return ' '
      if (key === 'Backspace' || key === 'Enter') return key
      return null
    }
    const enterKey = (key: string) => {
      const input = inputRef.current
      const editing = input !== null && document.activeElement === input
      const capturedStart = editing ? input.selectionStart : null
      const capturedEnd = editing ? input.selectionEnd : null
      setText((previous) => {
        const start = capturedStart === null ? previous.length : Math.min(capturedStart, previous.length)
        const end = capturedEnd === null ? previous.length : Math.min(capturedEnd, previous.length)
        let next: string
        let caret: number
        if (key === 'Backspace') {
          const from = start === end ? Math.max(0, start - 1) : start
          next = previous.slice(0, from) + previous.slice(end)
          caret = from
        } else {
          const inserted = key === 'Enter' ? '\n' : key
          next = previous.slice(0, start) + inserted + previous.slice(end)
          caret = start + inserted.length
        }
        next = sanitizeText(next)
        if (editing) {
          // Position the caret after React commits the new controlled value.
          requestAnimationFrame(() => {
            if (input && document.activeElement === input) {
              input.setSelectionRange(caret, caret)
              setSelection({ start: caret, end: caret })
            }
          })
        }
        return next
      })
    }
    const onKeyboardDown = (event: KeyboardEvent) => {
      // On iPhone-sized screens, let the real focused textarea handle native
      // software keyboard input. Preventing keydown here may dismiss the iOS
      // keyboard or make it fail to type into the textarea.
      if (document.activeElement === inputRef.current &&
          window.matchMedia('(max-width: 760px) and (pointer: coarse)').matches) return
      if (event.isComposing) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        // Sliders and buttons keep their shortcuts; everywhere else in FONT,
        // Ctrl/Cmd+A selects the typed text instead of webpage elements.
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
        event.preventDefault()
        stopRepeat()
        const input = inputRef.current
        if (input) {
          input.focus({ preventScroll: true })
          input.select()
          setSelection({ start: 0, end: input.value.length })
        }
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey) {
        stopRepeat()
        return
      }
      if (event.target instanceof HTMLButtonElement ||
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLSelectElement) return
      const key = normalizeKey(event.key)
      if (!key) return
      event.preventDefault()
      if (heldKey === key || event.repeat) return
      stopRepeat()
      heldKey = key
      enterKey(key)
      repeatDelay = setTimeout(() => {
        repeatDelay = null
        repeatTimer = setInterval(() => enterKey(key), 75)
      }, 400)
    }
    const onKeyboardUp = (event: KeyboardEvent) => {
      if (normalizeKey(event.key) === heldKey) stopRepeat()
    }
    const onVisibilityChange = () => {
      if (document.hidden) stopRepeat()
    }
    window.addEventListener('keydown', onKeyboardDown)
    window.addEventListener('keyup', onKeyboardUp)
    window.addEventListener('blur', stopRepeat)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stopRepeat()
      window.removeEventListener('keydown', onKeyboardDown)
      window.removeEventListener('keyup', onKeyboardUp)
      window.removeEventListener('blur', stopRepeat)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [active])

  const layout = useMemo(() => makeFontLayout(text, fontSize, axis, tracking, leading, alignment, referenceRatio),
    [text, fontSize, axis, tracking, leading, alignment, referenceRatio])

  // Limit only by the available width. Long text should extend the stage
  // vertically so the page can scroll instead of shrinking all glyphs.
  const selectionHighlights = useMemo(
    () => selectionRects(layout.characterBoxes, selection.start, selection.end),
    [layout, selection.start, selection.end],
  )

  const factor = Math.max(0.01, Math.min(1,
    // Keep the trailing caret visible even when tracking creates a larger gap.
    (stageSize.width - 56) / Math.max(1, layout.width, layout.caretX + 4),
  ))
  const contentMinHeight = Math.ceil(layout.height * factor + 110)

  // The visible PNG composition and the hidden native textarea share the same
  // character offsets. Dragging across PNGs selects their underlying text.
  const nearestCaret = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = compositionRef.current?.getBoundingClientRect()
    if (!rect) return text.length
    const x = (event.clientX - rect.left) / factor
    const y = (event.clientY - rect.top) / factor
    let best = 0
    let distance = Infinity
    for (let i = 0; i < layout.carets.length; i += 1) {
      const point = layout.carets[i]
      const deltaY = (y - point.y) * 1.6
      const score = (x - point.x) ** 2 + deltaY ** 2
      if (score < distance) { distance = score; best = i }
    }
    return best
  }
  const beginTextSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    // A real full-size transparent textarea receives native taps on phones.
    // Do not preventDefault() or capture its pointer: iOS Safari needs the
    // untouched tap event to bring up and keep the software keyboard.
    if (event.target === inputRef.current) return
    if ((event.target as HTMLElement).closest('.preview-actions')) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    const index = nearestCaret(event)
    const input = inputRef.current
    if (!input) return
    input.focus({ preventScroll: true })
    input.setSelectionRange(index, index)
    setSelection({ start: index, end: index })
    dragAnchor.current = index
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveTextSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragAnchor.current === null) return
    const index = nearestCaret(event)
    const start = Math.min(index, dragAnchor.current)
    const end = Math.max(index, dragAnchor.current)
    const direction = index < dragAnchor.current ? 'backward' : 'forward'
    inputRef.current?.setSelectionRange(start, end, direction)
    setSelection({ start, end })
  }
  const finishTextSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragAnchor.current === null) return
    moveTextSelection(event)
    dragAnchor.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const reset = () => {
    setFontSize(FONT_DEFAULTS.size)
    setAxis(FONT_DEFAULTS.axis)
    setTracking(FONT_DEFAULTS.tracking)
    setLeading(FONT_DEFAULTS.leading)
    setAlignment(FONT_DEFAULTS.alignment)
  }

  // RANDOM changes the FONT controls, not the characters the user has typed.
  // Each result respects the min / max / step of its corresponding slider.
  const randomize = () => {
    const randomStep = (minimum: number, maximum: number, step: number) =>
      minimum + Math.floor(Math.random() * (Math.round((maximum - minimum) / step) + 1)) * step
    // Restrict RANDOM to usable print sizes and gentle spacing adjustments.
    setFontSize(randomStep(72, 128, 2))
    setAxis(randomStep(-60, 60, 5))
    setTracking(randomStep(-1, 1, 0.25))
    setLeading(randomStep(-0.75, 1, 0.25))
    const alignments: Alignment[] = ['LEFT', 'CENTER', 'RIGHT']
    setAlignment(alignments[Math.floor(Math.random() * alignments.length)])
  }

  const print = async (backgroundMode: PrintBackground) => {
    if (exporting || layout.glyphs.length === 0) return
    setExporting(true)
    try {
      const names = [...new Set(layout.glyphs.map((item) => item.char))]
      const results = await Promise.allSettled(names.map((name) => fetchImage(fontUrl(name))))
      const missing = results.flatMap((result, index) => result.status === 'rejected' ? [fontUrl(names[index]).split('/').pop()] : [])
      if (missing.length) {
        window.alert(`다음 PNG 파일을 찾을 수 없습니다:\n${missing.join('\n')}\n\npublic/images/font/ 폴더를 확인해 주세요.`)
        return
      }
      const images = new Map<string, HTMLImageElement>()
      results.forEach((result, index) => { if (result.status === 'fulfilled') images.set(names[index], result.value) })
      const paddingX = Math.max(8, layout.width * 0.08)
      const paddingY = paddingX
      const outputWidth = layout.width + paddingX * 2
      const outputHeight = layout.height + paddingY * 2
      const exportRatio = Math.max(0.01, Math.min(4, 4096 / outputWidth, 4096 / outputHeight, Math.sqrt(12_000_000 / (outputWidth * outputHeight))))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(outputWidth * exportRatio))
      canvas.height = Math.max(1, Math.round(outputHeight * exportRatio))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas unavailable')
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-surface-2').trim() || '#B4BDCC'
      if (backgroundMode === 'background') {
        context.fillStyle = bg
        context.fillRect(0, 0, canvas.width, canvas.height)
      }
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.setTransform(exportRatio, 0, 0, exportRatio, paddingX * exportRatio, paddingY * exportRatio)
      for (const glyph of layout.glyphs) {
        const image = images.get(glyph.char)
        if (image) context.drawImage(image, glyph.x, glyph.y, glyph.width, glyph.height)
      }
      const link = document.createElement('a')
      link.href = canvas.toDataURL('image/png')
      link.download = `font-test-print-${backgroundMode}.png`
      link.click()
    } catch (error) {
      console.error('FONT PRINT failed:', error)
      window.alert('FONT PNG 내보내기에 실패했습니다.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="lab-layout font-layout" hidden={!active} aria-label="FONT text composition">
      {/* Mobile PRINT is anchored to the top-right of the gray lab, rather
          than following the preview below the header. Desktop remains as-is. */}
      <div className="preview-actions mobile-preview-actions" aria-label="Print settings (mobile)">
        <div className="print-dropdown">
          <button className="print-export-button" type="button" aria-haspopup="true"
            aria-label="PRINT: choose transparent or gray background"
            disabled={exporting || layout.glyphs.length === 0}>
            {exporting ? 'EXPORTING…' : 'PRINT'}
          </button>
          <div className="print-dropdown-menu" role="group" aria-label="Choose PNG export background">
            <button className="print-format-button" type="button" aria-pressed={printBackground === 'transparent'}
              disabled={exporting || layout.glyphs.length === 0}
              onClick={() => { onPrintBackgroundChange('transparent'); void print('transparent') }}>TRANSPARENT</button>
            <button className="print-format-button" type="button" aria-pressed={printBackground === 'background'}
              disabled={exporting || layout.glyphs.length === 0}
              onClick={() => { onPrintBackgroundChange('background'); void print('background') }}>BACKGROUND</button>
          </div>
        </div>
      </div>
      <aside className="font-axis-panel" aria-label="Vertical and horizontal letter proportion">
        <div className="study-inline-title font-study-inline-title">
          <strong className="study-inline-number tabular">00</strong>
          <h2 className="study-inline-name" aria-label="FONT">
            <img className="study-name-image" src={TITLE_IMAGE} alt="FONT" draggable={false} />
          </h2>
        </div>
        <span className="font-axis-title">VERTICAL —<br />HORIZONTAL<br />SCALE</span>
        <div className="font-axis-vertical">
          <span className="font-axis-top">V</span>
          <input type="range" aria-label="Vertical to horizontal font scale" min="-260" max="260" step="5" value={axis}
            onPointerDown={beginSliderDrag} onPointerUp={endSliderDrag} onPointerCancel={endSliderDrag} onBlur={endSliderDrag}
            onChange={(event) => setAxis(snapToDefault(Number(event.target.value), FONT_DEFAULTS.axis, 15))} />
          <span className="font-axis-mid">0</span><span className="font-axis-bottom">H</span>
        </div>
        <strong className="font-axis-value tabular">{axis === 0 ? '0' : axis > 0 ? `V +${axis}%` : `H +${-axis}%`}</strong>
        <p className="font-axis-help">UP / VERTICAL<br />DOWN / HORIZONTAL</p>
      </aside>
      <div className="font-preview-column">
        <div ref={stageRef} className="font-preview-stage"
          style={{ '--font-content-min-height': `${contentMinHeight}px` } as CSSProperties}
          onPointerDown={beginTextSelection}
          onPointerMove={moveTextSelection}
          onPointerUp={finishTextSelection}
          onPointerCancel={finishTextSelection}>
          <div className="preview-actions" aria-label="Print settings">
            <div className="print-dropdown">
              <button className="print-export-button" type="button" aria-haspopup="true" aria-label="PRINT: choose transparent or gray background" disabled={exporting || layout.glyphs.length === 0}>
                {exporting ? 'EXPORTING…' : 'PRINT'}
              </button>
              <div className="print-dropdown-menu" role="group" aria-label="Choose PNG export background">
                <button className="print-format-button" type="button" aria-pressed={printBackground === 'transparent'} disabled={exporting || layout.glyphs.length === 0}
                  onClick={() => { onPrintBackgroundChange('transparent'); void print('transparent') }}>TRANSPARENT</button>
                <button className="print-format-button" type="button" aria-pressed={printBackground === 'background'} disabled={exporting || layout.glyphs.length === 0}
                  onClick={() => { onPrintBackgroundChange('background'); void print('background') }}>BACKGROUND</button>
              </div>
            </div>
          </div>
          <textarea ref={inputRef} className="font-keyboard-input" aria-label="Type A to Z, period, space, Backspace or Enter"
            value={text} onChange={(event) => {
              setText(sanitizeText(event.target.value))
              const caret = event.target.selectionStart
              setSelection({ start: caret, end: event.target.selectionEnd })
            }}
            onSelect={updateSelection}
            onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)}
            spellCheck={false} autoCapitalize="characters" autoComplete="off" inputMode="text" />
          {text.length === 0 && !inputFocused && (
            <div className="font-empty-prompt" aria-hidden="true">
              <img className="font-empty-prompt-image" src={EMPTY_PROMPT_IMAGE} alt="TYPE TO PRINT" draggable={false} />
              <span>A–Z &nbsp; / &nbsp; . &nbsp; / &nbsp; SPACE &nbsp; / &nbsp; ENTER</span>
              <span>CLICK HERE TO USE THE KEYBOARD</span>
            </div>
          )}
          <div ref={compositionRef} className="font-composition" aria-label={`${text.length} entered characters, ${layout.lineCount} lines`}
            style={{ width: layout.width * factor, height: layout.height * factor }}>
            {inputFocused && selectionHighlights.map((rect, index) => (
              <span key={`selection-strip-${index}`} className="font-selection-block" aria-hidden="true" style={{
                left: rect.x * factor, top: rect.y * factor,
                width: rect.width * factor, height: rect.height * factor,
              }} />
            ))}
            {layout.glyphs.map((glyph) => <Glyph key={`${glyph.id}-${glyph.char}`} glyph={glyph} factor={factor} />)}
            {inputFocused && selection.start === selection.end && (
              <span className="font-blinking-caret" aria-hidden="true" style={{
                left: (layout.carets[selection.end]?.x ?? layout.caretX) * factor,
                top: (layout.carets[selection.end]?.y ?? layout.caretY) * factor,
                height: Math.max(22, layout.caretHeight * factor),
              }} />
            )}
          </div>
        </div>
      </div>
      {/* Full-width second grid row: controls are no longer positioned over the
          left axis panel. This keeps ALIGN buttons fully clickable. */}
      <section className="font-control-rail" aria-label="Font adjustment controls">
          {/* On phones the FONT axis scale belongs below the composition and
              above ALIGN. Desktop still uses its original vertical slider. */}
          <label className="rail-control font-mobile-axis-control">
            <span>VERTICAL — HORIZONTAL</span>
            <strong className="tabular">{axis === 0 ? '0%' : axis > 0 ? `V +${axis}%` : `H +${-axis}%`}</strong>
            <input type="range" aria-label="Vertical to horizontal font scale (mobile)"
              min="-260" max="260" step="5" value={-axis}
              style={{
                '--fill-start': axis > 0 ? `${50 - axis / 5.2}%` : '50%',
                '--fill-end': axis < 0 ? `${50 - axis / 5.2}%` : '50%',
              } as CSSProperties}
              onPointerDown={beginSliderDrag} onPointerUp={endSliderDrag}
              onPointerCancel={endSliderDrag} onBlur={endSliderDrag}
              onChange={(event) => setAxis(-snapToDefault(Number(event.target.value), -FONT_DEFAULTS.axis, 15))} />
            <small>VERTICAL ← 0 → HORIZONTAL</small>
          </label>
          <fieldset className="font-align-control">
            <legend>ALIGN</legend>
            <div className="font-align-options">
              {(['LEFT', 'CENTER', 'RIGHT'] as const).map((item) => (
                <button type="button" key={item} aria-pressed={alignment === item}
                  className={alignment === item ? 'is-selected' : ''} onClick={() => setAlignment(item)}>{item}</button>
              ))}
            </div>
            <small>TEXT ALIGNMENT</small>
          </fieldset>
          <label className="rail-control font-size-control">
            <span>FONT SIZE</span><strong className="tabular">{fontSize}px</strong>
            <input type="range" aria-label="Font size" min="24" max="220" step="1" value={fontSize}
              style={{ '--fill-end': `${(fontSize - 24) / 196 * 100}%` } as CSSProperties}
              onPointerDown={beginSliderDrag} onPointerUp={endSliderDrag} onPointerCancel={endSliderDrag} onBlur={endSliderDrag}
              onChange={(event) => setFontSize(snapToDefault(Number(event.target.value), FONT_DEFAULTS.size, 5))} />
            <small>24 — 220 PX</small>
          </label>
          <label className="rail-control font-tracking-control">
            <span>TRACKING</span><strong className="tabular">{tracking > 0 ? '+' : ''}{tracking}</strong>
            <input type="range" aria-label="Font tracking" min="-10" max="10" step="0.25" value={tracking}
              style={{ '--fill-start': `${Math.min(50, 50 + tracking * 5)}%`, '--fill-end': `${Math.max(50, 50 + tracking * 5)}%` } as CSSProperties}
              onPointerDown={beginSliderDrag} onPointerUp={endSliderDrag} onPointerCancel={endSliderDrag} onBlur={endSliderDrag}
              onChange={(event) => setTracking(snapToDefault(Number(event.target.value), FONT_DEFAULTS.tracking, 0.75))} />
            <small>0 = GAP 0.13 × LETTER WIDTH</small>
          </label>
          <label className="rail-control font-leading-control">
            <span>LEADING</span><strong className="tabular">{leading > 0 ? '+' : ''}{leading}</strong>
            <input type="range" aria-label="Font leading" min="-10" max="10" step="0.25" value={leading}
              style={{ '--fill-start': `${Math.min(50, 50 + leading * 5)}%`, '--fill-end': `${Math.max(50, 50 + leading * 5)}%` } as CSSProperties}
              onPointerDown={beginSliderDrag} onPointerUp={endSliderDrag} onPointerCancel={endSliderDrag} onBlur={endSliderDrag}
              onChange={(event) => setLeading(snapToDefault(Number(event.target.value), FONT_DEFAULTS.leading, 0.75))} />
            <small>0 = GAP 0.5 × LETTER HEIGHT</small>
          </label>
          <div className="font-actions">
            <button className="reset-trigger" type="button" onClick={reset}>RESET</button>
            <button className="random-trigger" type="button" onClick={randomize}>RANDOM</button>
          </div>
      </section>
    </section>
  )
}

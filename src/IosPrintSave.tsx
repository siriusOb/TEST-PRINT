import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import './ios-print-save.css'

export type IosPrintImage = { file: File; url: string }

/** Apply the new export path to iOS only; do not change desktop downloads. */
export function isIosPrintDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** Encode once, before presenting a new button for Safari's native share sheet. */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('PNG 이미지 생성에 실패했습니다.'))
    }, 'image/png')
  })
}

/**
 * iOS Safari needs a *new direct user tap* to launch navigator.share().
 * Starting the share after awaiting image downloads/canvas encoding can lose
 * transient user activation. Preparing the File first avoids that problem.
 */
export default function IosPrintSave({ image, onClose }: {
  image: IosPrintImage | null
  onClose: () => void
}) {
  const [message, setMessage] = useState('')

  useEffect(() => {
    setMessage('')
  }, [image?.url])

  useEffect(() => {
    if (!image) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [image, onClose])

  if (!image) return null

  const canShareFile = typeof navigator.canShare === 'function' &&
    typeof navigator.share === 'function' &&
    navigator.canShare({ files: [image.file] })

  const sharePreparedPng = () => {
    if (!canShareFile) {
      setMessage('이 환경은 PNG 파일 공유를 지원하지 않습니다. 아래 ‘이미지 열기’를 이용해 이미지를 길게 눌러 저장해 주세요.')
      return
    }
    // No await, timer, or promise before calling share: iOS requires the
    // user's current tap to be the trigger.
    try {
      void navigator.share({ files: [image.file] }).catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('iOS PRINT share failed:', error)
        setMessage('공유 메뉴를 열 수 없었습니다. ‘이미지 열기’로 이동해 이미지를 길게 눌러 저장해 주세요.')
      })
    } catch (error) {
      console.error('iOS PRINT share failed:', error)
      setMessage('공유 기능을 사용할 수 없습니다. ‘이미지 열기’를 이용해 주세요.')
    }
  }

  return createPortal(
    <div className="ios-print-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="ios-print-dialog" role="dialog" aria-modal="true" aria-label="PNG 이미지 저장">
        <div className="ios-print-heading">
          <strong>PRINT / PNG</strong>
          <button type="button" className="ios-print-close" aria-label="저장 화면 닫기" onClick={onClose}>✕</button>
        </div>
        <p className="ios-print-instructions">이미지가 준비되었습니다. 아래 버튼을 누르고 iPhone 공유 메뉴에서 <b>‘이미지 저장’</b> 또는 <b>‘파일에 저장’</b>을 선택하세요.</p>
        <div className="ios-print-image-wrap">
          <img src={image.url} alt="PRINT로 만든 PNG 이미지 미리보기" />
        </div>
        <button type="button" className="ios-print-share" onClick={sharePreparedPng}>
          공유 메뉴 열기 · 사진 / 파일에 저장
        </button>
        <a className="ios-print-open" href={image.url} target="_blank" rel="noopener noreferrer">
          이미지 열기 (저장 대체 방법)
        </a>
        {message && <p className="ios-print-error" role="status">{message}</p>}
        <p className="ios-print-help">공유 메뉴에서 ‘이미지 저장’이 보이지 않으면 ‘파일에 저장’을 선택하거나, 이미지를 열어 길게 눌러 저장하세요.</p>
      </section>
    </div>,
    document.body,
  )
}

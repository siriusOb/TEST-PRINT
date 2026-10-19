import CircleGraphic from './CircleGraphic'
type GraphicAssetProps = {
  source?: string
  highResolutionSource?: string
  sourceSet?: string
  count?: number
  showFallback?: boolean
  transform?: string
  alt: string
  className?: string
}

export default function GraphicAsset({
  source,
  highResolutionSource,
  sourceSet,
  count = 1,
  showFallback = true,
  transform,
  alt,
  className = '',
}: GraphicAssetProps) {
  const style = transform ? { transform } : undefined
  const resolvedSource = highResolutionSource || source
  const resolvedSourceSet = sourceSet || (highResolutionSource && source ? `${source} 1x, ${highResolutionSource} 2x` : undefined)

  return (
    <div className={`graphic-asset ${className}`} style={style}>
      {resolvedSource ? (
        <img
          src={resolvedSource}
          srcSet={resolvedSourceSet}
          sizes="(max-width: 760px) 76vw, 720px"
          alt={alt}
          decoding="sync"
          loading="eager"
          fetchPriority="high"
          draggable={false}
        />
      ) : showFallback ? <CircleGraphic count={count} /> : null}
    </div>
  )
}

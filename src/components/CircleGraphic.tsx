type CircleGraphicProps = { count?: number; className?: string }

export default function CircleGraphic({ count = 1, className = '' }: CircleGraphicProps) {
  const circles = Array.from({ length: count }, (_, index) => index)
  const cols = Math.ceil(Math.sqrt(count))
  return (
    <div className={`circle-graphic ${className}`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }} aria-label={`원형 그래픽 ${count}개`}>
      {circles.map((index) => <span className="circle-dot" key={index} />)}
    </div>
  )
}

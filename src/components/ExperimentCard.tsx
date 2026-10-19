import { ReactNode } from 'react'

type ExperimentCardProps = {
  number: string
  title: string
  description: string
  value: string
  children: ReactNode
  className?: string
}

export default function ExperimentCard({ number, title, description, value, children, className = '' }: ExperimentCardProps) {
  return <section className={`experiment-card ${className}`}>
    <header className="experiment-heading">
      <span className="experiment-number">EXPERIMENT {number}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </header>
    <div className="experiment-status"><span>CURRENT VALUE</span><strong className="tabular">{value}</strong></div>
    {children}
  </section>
}

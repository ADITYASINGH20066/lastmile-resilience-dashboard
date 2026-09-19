import type { ReactNode } from 'react'

type StateMessageProps = {
  title: string
  message: string
  tone?: 'neutral' | 'error' | 'success'
  action?: ReactNode
}

export function StateMessage({ title, message, tone = 'neutral', action }: StateMessageProps) {
  return (
    <section className={`panel state-message state-message-${tone}`}>
      <strong>{title}</strong>
      <span>{message}</span>
      {action}
    </section>
  )
}

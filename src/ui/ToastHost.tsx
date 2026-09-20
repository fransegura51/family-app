import { useEffect, useState } from 'react'
import { subscribeToast } from '@/state/toast'

export function ToastHost() {
  const [messages, setMessages] = useState<string[]>([])
  useEffect(() => subscribeToast(setMessages), [])
  if (messages.length === 0) return null
  return (
    <div className="toast-note" role="status" aria-live="polite">
      {messages.map((m) => (
        <div key={m}>{m}</div>
      ))}
    </div>
  )
}

import { useEffect, useState } from 'react'

/** Relógio das telas de agenda: minuto a minuto e imediatamente ao retomar a aba. */
export function useClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const refresh = () => {
      const next = new Date()
      setNow(previous => previous.getTime() === next.getTime() ? previous : next)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    const timer = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return now
}

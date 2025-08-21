import { useState, useCallback } from 'react'

const toastQueue = []
let toastId = 0
let listeners = []

export function useToast() {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((toast) => {
    const id = toastId++
    const newToast = {
      id,
      ...toast,
      open: true,
    }

    setToasts((prev) => [...prev, newToast])
    
    // Auto dismiss after 5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)

    return id
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((props) => {
    return addToast(props)
  }, [addToast])

  return {
    toast,
    toasts,
    dismiss: dismissToast,
  }
}


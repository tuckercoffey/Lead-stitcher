import { useToast } from '@/hooks/use-toast'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

export function Toaster() {
  const { toasts, dismiss } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map((toast) => {
        const Icon = toast.variant === 'destructive' ? AlertCircle : 
                   toast.variant === 'success' ? CheckCircle : Info

        return (
          <Alert
            key={toast.id}
            variant={toast.variant || 'default'}
            className="relative shadow-lg border bg-background animate-in slide-in-from-top-2"
          >
            <Icon className="h-4 w-4" />
            <div className="flex-1">
              {toast.title && <AlertTitle>{toast.title}</AlertTitle>}
              {toast.description && (
                <AlertDescription>{toast.description}</AlertDescription>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-2 right-2 h-6 w-6 p-0"
              onClick={() => dismiss(toast.id)}
            >
              <X className="h-3 w-3" />
            </Button>
          </Alert>
        )
      })}
    </div>
  )
}


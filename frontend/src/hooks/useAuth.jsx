import { createContext, useContext, useState, useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'

const AuthContext = createContext({})

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  // API helper function
  const apiCall = async (endpoint, options = {}) => {
    const url = `${API_BASE_URL}${endpoint}`
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      credentials: 'include', // Include cookies for authentication
      ...options,
    }

    if (options.body && typeof options.body === 'object') {
      config.body = JSON.stringify(options.body)
    }

    try {
      const response = await fetch(url, config)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || `HTTP error! status: ${response.status}`)
      }

      return data
    } catch (error) {
      console.error('API call failed:', error)
      throw error
    }
  }

  // Check if user is authenticated on app load
  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const data = await apiCall('/auth/me')
      setUser(data.user)
    } catch (error) {
      // User is not authenticated
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const login = async (email, password) => {
    try {
      const data = await apiCall('/auth/login', {
        method: 'POST',
        body: { email, password },
      })

      setUser(data.user)
      toast({
        title: 'Welcome back!',
        description: 'You have been logged in successfully.',
      })

      return { success: true }
    } catch (error) {
      toast({
        title: 'Login failed',
        description: error.message,
        variant: 'destructive',
      })
      return { success: false, error: error.message }
    }
  }

  const register = async (email, password, accountName) => {
    try {
      const data = await apiCall('/auth/register', {
        method: 'POST',
        body: { email, password, accountName },
      })

      setUser(data.user)
      toast({
        title: 'Account created!',
        description: 'Welcome to Lead Stitcher. Your account has been created successfully.',
      })

      return { success: true }
    } catch (error) {
      toast({
        title: 'Registration failed',
        description: error.message,
        variant: 'destructive',
      })
      return { success: false, error: error.message }
    }
  }

  const logout = async () => {
    try {
      await apiCall('/auth/logout', { method: 'POST' })
      setUser(null)
      toast({
        title: 'Logged out',
        description: 'You have been logged out successfully.',
      })
    } catch (error) {
      // Even if logout fails on server, clear local state
      setUser(null)
      toast({
        title: 'Logged out',
        description: 'You have been logged out.',
      })
    }
  }

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    apiCall,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}


import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '@/hooks/use-toast'
import { 
  Upload, 
  BarChart3, 
  Users, 
  TrendingUp, 
  FileText, 
  AlertCircle,
  CheckCircle,
  Clock,
  ArrowRight
} from 'lucide-react'

export default function Dashboard() {
  const [usage, setUsage] = useState(null)
  const [recentJobs, setRecentJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const { apiCall, user } = useAuth()
  const { toast } = useToast()

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      setLoading(true)
      
      // Load usage data
      const usageData = await apiCall('/usage')
      setUsage(usageData)

      // Load recent match jobs
      try {
        const jobsData = await apiCall('/match/jobs?limit=5')
        setRecentJobs(jobsData.jobs || [])
      } catch (error) {
        // Jobs endpoint might not have data yet
        setRecentJobs([])
      }

    } catch (error) {
      toast({
        title: 'Failed to load dashboard',
        description: error.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'running':
        return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusBadge = (status) => {
    const variants = {
      completed: 'default',
      running: 'secondary',
      failed: 'destructive',
      queued: 'outline'
    }
    return (
      <Badge variant={variants[status] || 'outline'} className="capitalize">
        {status}
      </Badge>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Welcome back, {user?.accountName}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Here's what's happening with your lead data
          </p>
        </div>
        <Button asChild className="shadow-lg hover:shadow-xl transition-shadow duration-200">
          <Link to="/upload">
            <Upload className="mr-2 h-4 w-4" />
            Upload Data
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="hover:shadow-lg transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leads Stitched</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {usage?.stitchedCount?.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              of {usage?.limit?.toLocaleString() || 0} this month
            </p>
            {usage && (
              <Progress 
                value={(usage.stitchedCount / usage.limit) * 100} 
                className="mt-2"
              />
            )}
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usage Remaining</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {usage?.remaining?.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {usage?.percentUsed || 0}% used this period
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Plan</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {usage?.planCode || 'FREE'}
            </div>
            <p className="text-xs text-muted-foreground">
              {usage?.planCode === 'FREE' ? 'Upgrade for more features' : 'Active subscription'}
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Jobs</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {recentJobs.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Processing jobs this week
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Match Jobs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Recent Match Jobs
              <Button variant="ghost" size="sm" asChild>
                <Link to="/exports">
                  View all
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </CardTitle>
            <CardDescription>
              Your latest data processing activities
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentJobs.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-sm">No match jobs yet</p>
                <p className="text-xs mt-1">Upload some data to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentJobs.map((job) => (
                  <div key={job.jobId} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(job.status)}
                      <div>
                        <p className="text-sm font-medium">
                          Match Job #{job.jobId.slice(-8)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {job.startedAt ? new Date(job.startedAt).toLocaleDateString() : 'Queued'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {getStatusBadge(job.status)}
                      {job.result && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {job.result.stitchedNew} new leads
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Common tasks to get you started
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild variant="outline" className="w-full justify-start">
              <Link to="/upload">
                <Upload className="mr-2 h-4 w-4" />
                Upload CSV Files
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link to="/policies">
                <BarChart3 className="mr-2 h-4 w-4" />
                Configure Attribution
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link to="/exports">
                <FileText className="mr-2 h-4 w-4" />
                Export Reports
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link to="/settings">
                <Users className="mr-2 h-4 w-4" />
                Account Settings
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Usage Warning */}
      {usage && usage.percentUsed > 80 && (
        <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20">
          <CardHeader>
            <CardTitle className="flex items-center text-orange-800 dark:text-orange-200">
              <AlertCircle className="mr-2 h-5 w-5" />
              Usage Warning
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-orange-700 dark:text-orange-300">
              You've used {usage.percentUsed}% of your monthly limit. 
              {usage.percentUsed > 90 ? ' Consider upgrading your plan to avoid service interruption.' : ' Monitor your usage to avoid hitting the limit.'}
            </p>
            {usage.planCode === 'FREE' && (
              <Button className="mt-3" size="sm">
                Upgrade Plan
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}


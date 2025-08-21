import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Download, Plus, Calendar, Filter } from 'lucide-react'

const SAMPLE_EXPORTS = [
  {
    id: 'export_1',
    name: 'Final Attribution Report',
    status: 'completed',
    createdAt: '2024-08-20T10:30:00Z',
    fileSize: '2.4 MB',
    recordCount: 1250,
  },
  {
    id: 'export_2',
    name: 'Audit Trail Export',
    status: 'running',
    createdAt: '2024-08-20T09:15:00Z',
    progress: 65,
  },
  {
    id: 'export_3',
    name: 'Monthly Attribution',
    status: 'completed',
    createdAt: '2024-08-19T16:45:00Z',
    fileSize: '1.8 MB',
    recordCount: 890,
  },
]

export default function ExportsPage() {
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

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Exports
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Generate and download attribution reports and audit trails
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Export
        </Button>
      </div>

      {/* Export Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="hover:shadow-lg transition-shadow duration-200 cursor-pointer">
          <CardHeader>
            <div className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle>Final Attribution Report</CardTitle>
            </div>
            <CardDescription>
              Export stitched leads with final attribution data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Includes lead information, attribution channels, revenue data, and confidence scores.
            </p>
            <Button variant="outline" className="w-full">
              Generate Report
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow duration-200 cursor-pointer">
          <CardHeader>
            <div className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle>Audit Trail Export</CardTitle>
            </div>
            <CardDescription>
              Export detailed matching and linking audit data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Includes source files, matching criteria, and decision reasoning for compliance.
            </p>
            <Button variant="outline" className="w-full">
              Generate Audit Trail
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Export History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Export History</CardTitle>
              <CardDescription>
                Your recent export jobs and downloads
              </CardDescription>
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm">
                <Calendar className="mr-1 h-3 w-3" />
                Date Range
              </Button>
              <Button variant="outline" size="sm">
                <Filter className="mr-1 h-3 w-3" />
                Filter
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {SAMPLE_EXPORTS.map((exportJob) => (
              <div key={exportJob.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  <FileText className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="font-medium">{exportJob.name}</p>
                    <p className="text-sm text-gray-500">
                      Created {formatDate(exportJob.createdAt)}
                      {exportJob.recordCount && ` • ${exportJob.recordCount.toLocaleString()} records`}
                      {exportJob.fileSize && ` • ${exportJob.fileSize}`}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  {getStatusBadge(exportJob.status)}
                  
                  {exportJob.status === 'running' && exportJob.progress && (
                    <div className="w-24">
                      <div className="text-xs text-gray-500 mb-1">{exportJob.progress}%</div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div 
                          className="bg-primary h-1.5 rounded-full transition-all duration-300" 
                          style={{ width: `${exportJob.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                  
                  {exportJob.status === 'completed' && (
                    <Button variant="outline" size="sm">
                      <Download className="mr-1 h-3 w-3" />
                      Download
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Export Info */}
      <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
        <CardHeader>
          <CardTitle className="text-green-800 dark:text-green-200">
            Export Information
          </CardTitle>
        </CardHeader>
        <CardContent className="text-green-700 dark:text-green-300">
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>Exports are generated in CSV format for easy analysis</li>
            <li>Files are available for download for 30 days after generation</li>
            <li>Large exports may take several minutes to process</li>
            <li>You can filter exports by date range and attribution policy</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}


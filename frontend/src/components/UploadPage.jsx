import { useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '@/hooks/use-toast'
import { 
  Upload, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  X,
  Download,
  Eye
} from 'lucide-react'

const SOURCE_TYPES = [
  { value: 'calls', label: 'Phone Calls', description: 'CallRail, call tracking data' },
  { value: 'forms', label: 'Form Submissions', description: 'Facebook Lead Ads, website forms' },
  { value: 'appts', label: 'Appointments', description: 'Calendly, booking systems' },
  { value: 'invoices', label: 'Invoices/Jobs', description: 'ServiceTitan, Jobber, invoicing' },
  { value: 'chats', label: 'Chat Messages', description: 'Live chat, messaging platforms' },
]

const COLUMN_MAPPINGS = {
  occurred_at: 'Timestamp/Date',
  name: 'Customer Name',
  phone: 'Phone Number',
  email: 'Email Address',
  gclid: 'Google Click ID',
  client_id: 'Google Client ID',
  utm_source: 'UTM Source',
  utm_medium: 'UTM Medium',
  utm_campaign: 'UTM Campaign',
  landing_page: 'Landing Page',
  location: 'Location/Address',
  duration_sec: 'Duration (seconds)',
  amount: 'Amount/Revenue',
  external_id: 'External ID',
}

export default function UploadPage() {
  const [files, setFiles] = useState([])
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [columnMapping, setColumnMapping] = useState({})
  const [sourceType, setSourceType] = useState('')
  const { apiCall } = useAuth()
  const { toast } = useToast()

  const handleDrag = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const droppedFiles = Array.from(e.dataTransfer.files)
    const csvFiles = droppedFiles.filter(file => 
      file.type === 'text/csv' || file.name.endsWith('.csv')
    )

    if (csvFiles.length !== droppedFiles.length) {
      toast({
        title: 'Invalid files',
        description: 'Only CSV files are allowed',
        variant: 'destructive',
      })
    }

    setFiles(prev => [...prev, ...csvFiles])
  }, [toast])

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files)
    setFiles(prev => [...prev, ...selectedFiles])
  }

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const uploadFiles = async () => {
    if (files.length === 0) return

    setUploading(true)
    const results = []

    try {
      for (const file of files) {
        const formData = new FormData()
        formData.append('file', file)

        const result = await apiCall('/uploads', {
          method: 'POST',
          body: formData,
          headers: {}, // Remove Content-Type to let browser set it for FormData
        })

        results.push({
          ...result,
          fileName: file.name,
          size: file.size,
        })
      }

      setUploadedFiles(results)
      setFiles([])
      
      toast({
        title: 'Upload successful',
        description: `${results.length} file(s) uploaded successfully`,
      })

    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
    }
  }

  const configureMapping = (file) => {
    setSelectedFile(file)
    setSourceType(file.detectedType || '')
    
    // Initialize column mapping based on detected headers
    const mapping = {}
    if (file.headers) {
      file.headers.forEach(header => {
        // Try to auto-map common column names
        const lowerHeader = header.toLowerCase()
        if (lowerHeader.includes('email')) mapping[header] = 'email'
        else if (lowerHeader.includes('phone')) mapping[header] = 'phone'
        else if (lowerHeader.includes('name')) mapping[header] = 'name'
        else if (lowerHeader.includes('date') || lowerHeader.includes('time')) mapping[header] = 'occurred_at'
        else if (lowerHeader.includes('amount') || lowerHeader.includes('revenue')) mapping[header] = 'amount'
        else if (lowerHeader.includes('location') || lowerHeader.includes('address')) mapping[header] = 'location'
      })
    }
    setColumnMapping(mapping)
  }

  const saveMapping = async () => {
    if (!selectedFile || !sourceType) return

    try {
      await apiCall(`/uploads/${selectedFile.uploadId}/parse`, {
        method: 'POST',
        body: {
          templateId: null, // We'll create the mapping inline
          columnMapping,
          sourceType,
        },
      })

      toast({
        title: 'Mapping saved',
        description: 'File has been processed and normalized',
      })

      // Update the file status
      setUploadedFiles(prev => 
        prev.map(file => 
          file.uploadId === selectedFile.uploadId 
            ? { ...file, status: 'normalized' }
            : file
        )
      )

      setSelectedFile(null)
    } catch (error) {
      toast({
        title: 'Processing failed',
        description: error.message,
        variant: 'destructive',
      })
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getStatusBadge = (status) => {
    const variants = {
      uploaded: 'secondary',
      normalized: 'default',
      matched: 'default',
      failed: 'destructive'
    }
    return (
      <Badge variant={variants[status] || 'outline'} className="capitalize">
        {status}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Upload Data
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Upload CSV files from your lead sources and configure column mappings
        </p>
      </div>

      {/* Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle>Upload CSV Files</CardTitle>
          <CardDescription>
            Drag and drop your CSV files here, or click to select files
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`
              border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-200
              ${dragActive 
                ? 'border-primary bg-primary/5' 
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
              }
            `}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-medium mb-2">
              Drop your CSV files here
            </p>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              or click to browse your computer
            </p>
            <Input
              type="file"
              multiple
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
            />
            <Label htmlFor="file-upload">
              <Button variant="outline" className="cursor-pointer">
                Select Files
              </Button>
            </Label>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="mt-6 space-y-2">
              <h4 className="font-medium">Selected Files</h4>
              {files.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <FileText className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="font-medium">{file.name}</p>
                      <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              
              <Button 
                onClick={uploadFiles} 
                disabled={uploading}
                className="w-full mt-4"
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload {files.length} file(s)
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Uploaded Files</CardTitle>
            <CardDescription>
              Configure column mappings for your uploaded files
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {uploadedFiles.map((file) => (
                <div key={file.uploadId} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <FileText className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="font-medium">{file.fileName}</p>
                      <p className="text-sm text-gray-500">
                        {formatFileSize(file.size)} • Detected: {file.detectedType || 'Unknown'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusBadge(file.status)}
                    {file.status === 'uploaded' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => configureMapping(file)}
                      >
                        Configure
                      </Button>
                    )}
                    {file.status === 'normalized' && (
                      <Button variant="outline" size="sm">
                        <Eye className="h-4 w-4 mr-1" />
                        Preview
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Column Mapping Modal */}
      {selectedFile && (
        <Card>
          <CardHeader>
            <CardTitle>Configure Column Mapping</CardTitle>
            <CardDescription>
              Map your CSV columns to Lead Stitcher fields for {selectedFile.fileName}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="sourceType">Source Type</Label>
              <Select value={sourceType} onValueChange={setSourceType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select source type" />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div>
                        <div className="font-medium">{type.label}</div>
                        <div className="text-sm text-gray-500">{type.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Column Mappings</Label>
              {selectedFile.headers?.map((header) => (
                <div key={header} className="flex items-center space-x-3">
                  <div className="w-1/3">
                    <Label className="text-sm font-medium">{header}</Label>
                  </div>
                  <div className="w-2/3">
                    <Select 
                      value={columnMapping[header] || ''} 
                      onValueChange={(value) => 
                        setColumnMapping(prev => ({ ...prev, [header]: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select field" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Skip this column</SelectItem>
                        {Object.entries(COLUMN_MAPPINGS).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex space-x-2">
              <Button onClick={saveMapping} disabled={!sourceType}>
                <CheckCircle className="mr-2 h-4 w-4" />
                Save & Process
              </Button>
              <Button variant="outline" onClick={() => setSelectedFile(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}


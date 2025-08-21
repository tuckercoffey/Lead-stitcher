import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Shield, Plus, Edit, Trash2 } from 'lucide-react'

const DEFAULT_POLICIES = [
  {
    id: 'paid_last_roofing',
    name: 'Paid-Last Roofing Default',
    description: 'Attribution model optimized for roofing and HVAC businesses',
    attributionMode: 'paid_last',
    isDefault: true,
  },
  {
    id: 'first_touch_pi_law',
    name: 'First-Touch PI Law',
    description: 'First-touch attribution for personal injury law firms',
    attributionMode: 'first_touch',
    isDefault: true,
  },
  {
    id: 'dental_equal_weight',
    name: 'Dental Equal Weight',
    description: 'Equal weight attribution for dental practices',
    attributionMode: 'equal_weight',
    isDefault: true,
  },
  {
    id: 'auto_call_first',
    name: 'Auto Call-First',
    description: 'Call-first attribution for automotive services',
    attributionMode: 'call_first',
    isDefault: true,
  },
]

export default function PoliciesPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Attribution Policies
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Configure how leads are matched and attributed across your data sources
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Policy
        </Button>
      </div>

      {/* Policy Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {DEFAULT_POLICIES.map((policy) => (
          <Card key={policy.id} className="hover:shadow-lg transition-shadow duration-200">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2">
                  <Shield className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">{policy.name}</CardTitle>
                </div>
                {policy.isDefault && (
                  <Badge variant="secondary">Default</Badge>
                )}
              </div>
              <CardDescription>{policy.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <span className="text-sm font-medium">Attribution Mode:</span>
                  <Badge variant="outline" className="ml-2 capitalize">
                    {policy.attributionMode.replace('_', ' ')}
                  </Badge>
                </div>
                
                <div className="flex space-x-2">
                  <Button variant="outline" size="sm">
                    <Edit className="mr-1 h-3 w-3" />
                    Edit
                  </Button>
                  {!policy.isDefault && (
                    <Button variant="outline" size="sm">
                      <Trash2 className="mr-1 h-3 w-3" />
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Info Card */}
      <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <CardHeader>
          <CardTitle className="text-blue-800 dark:text-blue-200">
            About Attribution Policies
          </CardTitle>
        </CardHeader>
        <CardContent className="text-blue-700 dark:text-blue-300">
          <p className="mb-2">
            Attribution policies determine how leads are matched across different data sources and how credit is assigned to marketing channels.
          </p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li><strong>Paid-Last:</strong> Credits the last paid marketing touchpoint</li>
            <li><strong>First-Touch:</strong> Credits the first marketing touchpoint</li>
            <li><strong>Last-Touch:</strong> Credits the most recent touchpoint</li>
            <li><strong>Call-First:</strong> Prioritizes phone call interactions</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}


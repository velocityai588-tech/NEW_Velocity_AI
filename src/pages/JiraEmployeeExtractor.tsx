import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Users, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react'
import { apiUrl } from '@/lib/api'
import { fetchProjectsHybrid } from '@/lib/jiraDbClient'
import { useToast } from '@/hooks/use-toast'

interface JiraSite {
  id: string
  name: string
  url: string
}

interface JiraProject {
  key: string
  title: string
  id: string
}

interface EmployeeSkill {
  name: string
  skills: string[]
  source: string
}

export default function JiraEmployeeExtractor() {
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [connected, setConnected] = useState(false)
  const [availableSites, setAvailableSites] = useState<JiraSite[]>([])
  const [currentSiteId, setCurrentSiteId] = useState<string | null>(null)
  const [availableProjects, setAvailableProjects] = useState<JiraProject[]>([])
  const [selectedProjects, setSelectedProjects] = useState<string[]>([])
  const [extracting, setExtracting] = useState(false)
  const [extractedEmployees, setExtractedEmployees] = useState<EmployeeSkill[]>([])
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  // Check Jira connection status on mount
  useEffect(() => {
    checkConnectionStatus()
  }, [])

  const checkConnectionStatus = async () => {
    try {
      const response = await fetch(apiUrl('/api/jira/auth/status'), {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
        setConnected(data.connected)
        setCurrentSiteId(data.site?.cloudId || null)
        setAvailableSites(data.availableSites || [])
      }
    } catch (error) {
      console.error('Error checking connection:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleConnect = () => {
    setConnecting(true)
    window.location.href = apiUrl('/api/jira/auth/connect')
  }

  const handleSwitchSite = async (siteId: string) => {
    try {
      const response = await fetch(apiUrl(`/api/jira/auth/switch-site/${siteId}`), {
        method: 'POST',
        credentials: 'include'
      })
      if (response.ok) {
        setCurrentSiteId(siteId)
        await fetchProjects()
        toast({
          title: "Site switched",
          description: "Successfully switched to the selected Jira site.",
        })
      } else {
        throw new Error('Failed to switch site')
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to switch Jira site.",
        variant: "destructive",
      })
    }
  }

  const fetchProjects = async () => {
    try {
      // API-first: fetch from live API
      const { projects, source } = await fetchProjectsHybrid()
      console.log(`[JiraEmployeeExtractor] Loaded ${projects.length} projects from ${source}`)
      setAvailableProjects(projects.map(p => ({ key: p.key, title: p.title, id: p.id })))
    } catch (error) {
      console.error('Error fetching projects:', error)
      toast({
        title: "Error",
        description: "Failed to fetch Jira projects.",
        variant: "destructive",
      })
    }
  }

  const handleProjectToggle = (projectKey: string) => {
    setSelectedProjects(prev =>
      prev.includes(projectKey)
        ? prev.filter(key => key !== projectKey)
        : [...prev, projectKey]
    )
  }

  const handleExtractSkills = async () => {
    if (selectedProjects.length === 0) {
      toast({
        title: "No projects selected",
        description: "Please select at least one project to extract employee skills from.",
        variant: "destructive",
      })
      return
    }

    setExtracting(true)
    try {
      const response = await fetch(apiUrl('/api/jira/extract-employee-skills'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          projectKeys: selectedProjects
        })
      })

      if (response.ok) {
        const data = await response.json()
        setExtractedEmployees(data.employees || [])
        toast({
          title: "Skills extracted",
          description: `Successfully extracted skills for ${data.employees?.length || 0} employees.`,
        })
      } else {
        throw new Error('Failed to extract skills')
      }
    } catch (error) {
      console.error('Error extracting skills:', error)
      toast({
        title: "Error",
        description: "Failed to extract employee skills from Jira.",
        variant: "destructive",
      })
    } finally {
      setExtracting(false)
    }
  }

  const handleSaveToCSV = async () => {
    if (extractedEmployees.length === 0) {
      toast({
        title: "No data to save",
        description: "Please extract employee skills first.",
        variant: "destructive",
      })
      return
    }

    setSaving(true)
    try {
      const response = await fetch(apiUrl('/api/jira/save-employee-skills'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          employees: extractedEmployees
        })
      })

      if (response.ok) {
        toast({
          title: "Data saved",
          description: "Employee skills have been saved to the CSV file.",
        })
      } else {
        throw new Error('Failed to save data')
      }
    } catch (error) {
      console.error('Error saving data:', error)
      toast({
        title: "Error",
        description: "Failed to save employee skills.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-lg">Loading...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-light text-gray-800 mb-2">
            🔗 Jira Employee Skills Extractor
          </h1>
          <p className="text-gray-600">
            Connect to Jira and extract employee skills from project data
          </p>
        </div>

        {/* Connection Status */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {connected ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-500" />
              )}
              Jira Connection
            </CardTitle>
            <CardDescription>
              {connected
                ? "Connected to Jira. You can now select projects and extract employee skills."
                : "Connect to your Jira account to extract employee skills from projects."
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!connected ? (
              <Button
                onClick={handleConnect}
                disabled={connecting}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {connecting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Connect to Jira
                  </>
                )}
              </Button>
            ) : (
              <div className="space-y-4">
                {/* Site Selector */}
                {availableSites.length > 1 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Jira Site:
                    </label>
                    <select
                      value={currentSiteId || ''}
                      onChange={(e) => handleSwitchSite(e.target.value)}
                      className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {availableSites.map(site => (
                        <option key={site.id} value={site.id}>
                          {site.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm">Connected to Jira</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Project Selection */}
        {connected && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Select Projects
              </CardTitle>
              <CardDescription>
                Choose the Jira projects from which to extract employee skills
              </CardDescription>
            </CardHeader>
            <CardContent>
              {availableProjects.length === 0 ? (
                <div className="text-center py-8">
                  <Button
                    onClick={fetchProjects}
                    variant="outline"
                    className="mb-4"
                  >
                    Load Available Projects
                  </Button>
                  <p className="text-gray-500">No projects loaded yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {availableProjects.map(project => (
                      <div
                        key={project.key}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedProjects.includes(project.key)
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => handleProjectToggle(project.key)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{project.title}</div>
                            <div className="text-sm text-gray-500">{project.key}</div>
                          </div>
                          {selectedProjects.includes(project.key) && (
                            <CheckCircle className="h-4 w-4 text-blue-500" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="text-sm text-gray-600">
                      {selectedProjects.length} project{selectedProjects.length !== 1 ? 's' : ''} selected
                    </div>
                    <Button
                      onClick={handleExtractSkills}
                      disabled={selectedProjects.length === 0 || extracting}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {extracting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Extracting Skills...
                        </>
                      ) : (
                        <>
                          <Users className="h-4 w-4 mr-2" />
                          Extract Skills
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Extracted Employees */}
        {extractedEmployees.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Extracted Employee Skills
              </CardTitle>
              <CardDescription>
                {extractedEmployees.length} employees found with skills from selected projects
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {extractedEmployees.map((employee, index) => (
                  <div key={index} className="p-4 border rounded-lg bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-900">{employee.name}</h4>
                      <Badge variant="secondary">{employee.source}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {employee.skills.map((skill, skillIndex) => (
                        <Badge key={skillIndex} variant="outline">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-4 border-t mt-4">
                <Button
                  onClick={handleSaveToCSV}
                  disabled={saving}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Save to CSV
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, AlertCircle, Clock, ExternalLink, ChevronDown } from 'lucide-react';

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: string;
  bgColor: string;
  connected: boolean;
  status: 'connected' | 'disconnected' | 'pending';
  lastSync?: string;
  scopes?: string[];
  events?: string[];
}

export default function IntegrationsTab() {
  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: 'jira',
      name: 'Jira',
      description: 'Track project management and issue resolution times',
      icon: 'J',
      bgColor: 'bg-blue-500',
      connected: false,
      status: 'disconnected',
      scopes: ['issues.read', 'sprints.read', 'projects.read'],
      events: ['issue.created', 'issue.updated', 'sprint.completed']
    },
    {
      id: 'asana',
      name: 'Asana',
      description: 'Monitor task completion and team productivity',
      icon: 'A',
      bgColor: 'bg-pink-500',
      connected: false,
      status: 'disconnected',
      scopes: ['tasks.read', 'projects.read'],
      events: ['task.completed', 'project.updated']
    },
    {
      id: 'hubspot',
      name: 'HubSpot',
      description: 'Track CRM activities and deal progression',
      icon: 'H',
      bgColor: 'bg-orange-500',
      connected: false,
      status: 'disconnected',
      scopes: ['contacts.read', 'deals.read', 'companies.read'],
      events: ['contact.created', 'deal.closed', 'company.updated']
    },
    {
      id: 'microsoft365',
      name: 'Microsoft 365',
      description: 'Analyze calendar events and user productivity data',
      icon: 'M',
      bgColor: 'bg-blue-600',
      connected: false,
      status: 'disconnected',
      scopes: ['User.Read', 'Calendars.Read'],
      events: ['meeting.created', 'meeting.duration']
    }
  ]);

  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [jiraSites, setJiraSites] = useState<Array<{ id: string; name: string; url: string }>>([]);
  const [selectedJiraSite, setSelectedJiraSite] = useState<string>('');
  const [showSiteSelector, setShowSiteSelector] = useState(false);
  const [switchingSite, setSwitchingSite] = useState(false);

  // Check connection status on mount
  useEffect(() => {
    checkAllConnections();
  }, []);

  const checkAllConnections = async () => {
    const updatedIntegrations = [...integrations];

    // Check Jira
    try {
      const jiraResponse = await fetch('/api/jira/auth/status', { credentials: 'include' });
      const jiraData = await jiraResponse.json();
      const jiraIndex = updatedIntegrations.findIndex(i => i.id === 'jira');
      if (jiraIndex !== -1) {
        updatedIntegrations[jiraIndex].connected = jiraData.connected;
        updatedIntegrations[jiraIndex].status = jiraData.connected ? 'connected' : 'disconnected';
        if (jiraData.connected) {
          updatedIntegrations[jiraIndex].lastSync = '1 minute ago';
          // Fetch available sites for this user
          if (jiraData.availableSites && jiraData.availableSites.length > 0) {
            setJiraSites(jiraData.availableSites);
            // Set the currently selected site (the one that's active)
            if (jiraData.site && jiraData.site.id) {
              setSelectedJiraSite(jiraData.site.id);
            } else if (jiraData.availableSites[0]) {
              setSelectedJiraSite(jiraData.availableSites[0].id);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to check Jira:', error);
    }

    // Check HubSpot
    try {
      const hubspotResponse = await fetch('/api/hubspot/auth/status');
      const hubspotData = await hubspotResponse.json();
      const hubspotIndex = updatedIntegrations.findIndex(i => i.id === 'hubspot');
      if (hubspotIndex !== -1) {
        updatedIntegrations[hubspotIndex].connected = hubspotData.authenticated;
        updatedIntegrations[hubspotIndex].status = hubspotData.authenticated ? 'connected' : 'disconnected';
        if (hubspotData.authenticated) {
          updatedIntegrations[hubspotIndex].lastSync = '2 minutes ago';
        }
      }
    } catch (error) {
      console.error('Failed to check HubSpot:', error);
    }

    // Check Microsoft 365
    try {
      const m365Response = await fetch('/api/microsoft365/auth/status');
      const m365Data = await m365Response.json();
      const m365Index = updatedIntegrations.findIndex(i => i.id === 'microsoft365');
      if (m365Index !== -1) {
        updatedIntegrations[m365Index].connected = m365Data.authenticated;
        updatedIntegrations[m365Index].status = m365Data.authenticated ? 'connected' : 'disconnected';
        if (m365Data.authenticated) {
          updatedIntegrations[m365Index].lastSync = '1 minute ago';
        }
      }
    } catch (error) {
      console.error('Failed to check M365:', error);
    }

    setIntegrations(updatedIntegrations);
  };

  const handleConnect = (integrationId: string) => {
    setLoadingStates(prev => ({ ...prev, [integrationId]: true }));

    switch (integrationId) {
      case 'microsoft365':
        window.location.href = '/api/microsoft365/auth/login';
        break;
      case 'hubspot':
        window.location.href = '/api/hubspot/auth/connect';
        break;
      case 'jira':
        // Redirect to Jira OAuth flow
        window.location.href = '/api/jira/auth/connect';
        break;
      case 'asana':
        // For Asana, similar to Jira
        alert('Asana integration requires API token configuration. Please go to Security Audit > Integrations to configure.');
        setLoadingStates(prev => ({ ...prev, [integrationId]: false }));
        break;
      default:
        setLoadingStates(prev => ({ ...prev, [integrationId]: false }));
    }
  };

  const handleDisconnect = async (integrationId: string) => {
    try {
      if (integrationId === 'hubspot') {
        await fetch('/api/hubspot/auth/disconnect');
      } else if (integrationId === 'microsoft365') {
        // M365 disconnect would need to be implemented
        alert('Microsoft 365 disconnect not yet implemented');
        return;
      } else if (integrationId === 'jira') {
        await fetch('/api/jira/auth/disconnect', { method: 'POST', credentials: 'include' });
        setJiraSites([]);
        setSelectedJiraSite('');
        setShowSiteSelector(false);
      }

      setIntegrations(prev =>
        prev.map(int =>
          int.id === integrationId
            ? { ...int, connected: false, status: 'disconnected' as const, lastSync: undefined }
            : int
        )
      );
    } catch (error) {
      console.error(`Failed to disconnect ${integrationId}:`, error);
    }
  };

  const handleSwitchJiraSite = async (siteId: string) => {
    if (siteId === selectedJiraSite) {
      setShowSiteSelector(false);
      return;
    }

    setSwitchingSite(true);
    try {
      const response = await fetch(`/api/jira/auth/switch-site/${siteId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Failed to switch Jira site');
      }

      const data = await response.json();
      setSelectedJiraSite(siteId);
      setShowSiteSelector(false);
      console.log('Switched to Jira site:', data.site.name);
    } catch (error) {
      console.error('Failed to switch Jira site:', error);
      alert('Failed to switch Jira site. Please try again.');
    } finally {
      setSwitchingSite(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-600" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'pending':
        return 'Pending';
      default:
        return 'Not Connected';
    }
  };

  const handleOpen = (integrationId: string) => {
    switch (integrationId) {
      case 'hubspot':
        window.location.href = '/projects/hubspot-dashboard';
        break;
      case 'microsoft365':
        window.location.href = '/projects/microsoft365-dashboard';
        break;
      case 'jira':
        window.location.href = '/projects/jira-dashboard';
        break;
      case 'asana':
        window.location.href = '/projects/asana-dashboard';
        break;
      default:
        console.warn(`No dashboard available for ${integrationId}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h2 className="text-xl sm:text-2xl lg:text-3xl font-light text-gray-900">Integrations</h2>
        <p className="text-xs sm:text-sm text-gray-600 mt-2 leading-relaxed">
          Connect your workflow tools to track productivity gains and measure ROI across all your systems.
        </p>
      </div>

      {/* Integration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {integrations.map((integration) => (
          <Card key={integration.id} className="p-4 sm:p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 ${integration.bgColor} rounded-lg flex items-center justify-center text-white font-light flex-shrink-0`}>
                  {integration.icon}
                </div>
                <div className="min-w-0">
                  <h3 className="font-light text-gray-900 text-sm sm:text-base truncate">{integration.name}</h3>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">{integration.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {getStatusIcon(integration.status)}
                <span className={`text-xs font-semibold ${
                  integration.status === 'connected' ? 'text-green-600' :
                  integration.status === 'pending' ? 'text-yellow-600' : 'text-gray-600'
                }`}>
                  {getStatusText(integration.status)}
                </span>
              </div>
            </div>

            {/* Scopes */}
            {integration.scopes && integration.scopes.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-gray-500 mb-1">Scopes:</div>
                <div className="flex flex-wrap gap-1">
                  {integration.scopes.map((scope) => (
                    <span
                      key={scope}
                      className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Events */}
            {integration.events && integration.events.length > 0 && (
              <div className="mb-4">
                <div className="text-xs text-gray-500 mb-1">Events Tracked:</div>
                <div className="flex flex-wrap gap-1">
                  {integration.events.map((event) => (
                    <span
                      key={event}
                      className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-lg font-light"
                    >
                      {event}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Last Sync */}
            {integration.lastSync && (
              <div className="text-xs text-gray-500 mb-4">
                Last sync: {integration.lastSync}
              </div>
            )}

            {/* Jira Site Selector */}
            {integration.id === 'jira' && integration.connected && jiraSites.length > 1 && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-xs font-semibold text-gray-700 mb-2">Jira Workspace</div>
                <div className="relative">
                  <button
                    onClick={() => setShowSiteSelector(!showSiteSelector)}
                    className="w-full px-3 py-2 text-xs bg-white border border-gray-300 rounded-lg text-left flex items-center justify-between hover:border-gray-400 transition-colors"
                  >
                    <span>{jiraSites.find(s => s.id === selectedJiraSite)?.name || 'Select workspace'}</span>
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  
                  {showSiteSelector && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-10">
                      {jiraSites.map(site => (
                        <button
                          key={site.id}
                          onClick={() => handleSwitchJiraSite(site.id)}
                          disabled={switchingSite}
                          className={`w-full px-3 py-2 text-xs text-left hover:bg-blue-50 transition-colors ${
                            selectedJiraSite === site.id ? 'bg-blue-100 font-semibold' : ''
                          } ${switchingSite ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {site.name}
                          {selectedJiraSite === site.id && ' ✓'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-2">
              {integration.connected ? (
                <>
                  <Button
                    onClick={() => handleOpen(integration.id)}
                    variant="outline"
                    size="sm"
                    className="border-primary/30 text-primary hover:bg-primary/10 font-light"
                  >
                    Open
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </Button>
                  <Button
                    onClick={() => handleDisconnect(integration.id)}
                    variant="outline"
                    size="sm"
                    className="border-red-300 text-red-600 hover:bg-red-50"
                  >
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => handleConnect(integration.id)}
                  disabled={loadingStates[integration.id]}
                  size="sm"
                  className={`${
                    integration.id === 'microsoft365' || integration.id === 'hubspot'
                      ? 'bg-primary hover:bg-primary/90 font-light'
                      : 'bg-gray-600 hover:bg-gray-700'
                  }`}
                >
                  {loadingStates[integration.id] ? 'Connecting...' : 'Connect'}
                  {(integration.id === 'microsoft365' || integration.id === 'hubspot') && (
                    <ExternalLink className="w-3 h-3 ml-1" />
                  )}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Info Card */}
      <Card className="p-4 sm:p-6 bg-primary/10 border-primary/20">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-blue-900 mb-1">Integration Setup</h4>
            <p className="text-sm text-blue-700">
              OAuth integrations (Microsoft 365, HubSpot) will redirect you to authenticate with the service.
              API-based integrations (Jira, Asana) require token configuration in the Security Audit section.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

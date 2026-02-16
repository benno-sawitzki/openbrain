// Provider registry — declarative metadata for all available providers per slot.
// Used by both the server (GET /api/providers, test endpoint) and client (Settings UI).

export interface ProviderFieldDef {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number';
  required: boolean;
  placeholder?: string;
  helpText?: string;
}

export interface ProviderDef {
  id: string;
  name: string;
  slot: 'tasks' | 'crm' | 'content';
  fields: ProviderFieldDef[];
}

export const PROVIDER_REGISTRY: ProviderDef[] = [
  // Tasks
  {
    id: 'taskpipe',
    name: 'Taskpipe (CLI)',
    slot: 'tasks',
    fields: [],
  },
  {
    id: 'todoist',
    name: 'Todoist',
    slot: 'tasks',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', required: true, placeholder: 'Your Todoist API key' },
      { key: 'project_ids', label: 'Project IDs', type: 'text', required: false, placeholder: 'Comma-separated IDs (optional)', helpText: 'Leave empty for all projects' },
      { key: 'max_items', label: 'Max Items', type: 'number', required: false, placeholder: '100' },
    ],
  },
  {
    id: 'github',
    name: 'GitHub Issues',
    slot: 'tasks',
    fields: [
      { key: 'token', label: 'Personal Access Token', type: 'password', required: true, placeholder: 'ghp_... or $GITHUB_TOKEN' },
      { key: 'owner', label: 'Owner', type: 'text', required: true, placeholder: 'username or org' },
      { key: 'repo', label: 'Repository', type: 'text', required: true, placeholder: 'repo-name' },
      { key: 'max_items', label: 'Max Items', type: 'number', required: false, placeholder: '100' },
    ],
  },

  // CRM
  {
    id: 'leadpipe',
    name: 'Leadpipe (CLI)',
    slot: 'crm',
    fields: [],
  },
  {
    id: 'pipedrive',
    name: 'Pipedrive',
    slot: 'crm',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', required: true, placeholder: 'Your Pipedrive API key' },
      { key: 'domain', label: 'Domain', type: 'text', required: false, placeholder: 'your-company', helpText: 'Your Pipedrive subdomain' },
      { key: 'pipeline_id', label: 'Pipeline ID', type: 'number', required: false, placeholder: 'Default pipeline' },
    ],
  },

  // Content
  {
    id: 'contentq',
    name: 'Content Queue (CLI)',
    slot: 'content',
    fields: [],
  },
];

export const SLOTS = ['tasks', 'crm', 'content'] as const;
export type Slot = typeof SLOTS[number];

export const SLOT_LABELS: Record<Slot, string> = {
  tasks: 'Task Management',
  crm: 'CRM',
  content: 'Content',
};

export function getProvidersForSlot(slot: Slot): ProviderDef[] {
  return PROVIDER_REGISTRY.filter(p => p.slot === slot);
}

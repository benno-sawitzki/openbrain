export interface Task {
  id: string;
  content: string;
  status: 'todo' | 'in_progress' | 'done' | 'doing' | 'blocked';
  energy?: 'high' | 'medium' | 'low';
  estimate?: number;
  actual?: number;
  due?: string;
  tags?: string[];
  campaign?: string;
  stake?: string;
  difficulty?: string;
  delegatedTo?: string;
  notes?: string[];
  links?: Record<string, string>;
  reminders?: { at: string }[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface Lead {
  id: string;
  name: string;
  email?: string;
  company?: string;
  source?: string;
  value?: number;
  stage: string;
  score?: number;
  tags?: string[];
  touches?: { date: string; type: string; note: string }[];
  followUp?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContentItem {
  id: string;
  text: string;
  platform: string;
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  tags?: string[];
  scheduledFor?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InboxItem {
  id: string;
  type: 'social' | 'inspo' | 'idea' | 'general';
  title?: string;
  text?: string;
  note?: string;
  url?: string;
  source?: string;
  media?: string;
  mediaType?: string;
  tags?: string[];
  promoted?: boolean;
  createdAt: string;
}

export interface Stats {
  streak?: number;
  doneToday?: number;
  pipelineValue?: number;
  drafts?: number;
  stakeRisk?: number;
  overdueStakes?: number;
}

export interface AppState {
  tasks: Task[];
  leads: Lead[];
  content: ContentItem[];
  inbox: InboxItem[];
  activity: { activity?: { events?: { ts: string; type?: string }[]; profile?: Record<string, string> }; patterns?: { dailyCompletions?: Record<string, number> } };
  stats: Stats;
  config: Record<string, unknown>;
  agents: { available?: boolean; workflows?: { id?: string; name?: string; status?: string; task?: string; step?: string; startedAt?: string }[]; logs?: string };
}

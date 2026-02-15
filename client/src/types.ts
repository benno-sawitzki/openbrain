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
  workflowDefs?: WorkflowDef[];
  workflowRuns?: WorkflowRunSummary[];
}

// --- Workflow types ---
export interface WorkflowStepDef {
  id: string;
  agentId: string;
  inputTemplate: string;
  expects: string;
  type: 'single' | 'loop';
  loopConfig?: { over: 'stories'; verifyEach?: boolean; verifyStep?: string };
  maxRetries?: number;
}

export interface WorkflowDef {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStepDef[];
  createdAt: string;
  updatedAt: string;
}

export type StepStatus = 'waiting' | 'pending' | 'running' | 'done' | 'failed';
export type RunStatus = 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface WorkflowRunStep {
  id: string;
  runId: string;
  stepId: string;
  agentId: string;
  stepIndex: number;
  status: StepStatus;
  output?: string;
  retryCount: number;
  maxRetries: number;
  currentStoryId?: string;
  type: 'single' | 'loop';
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStory {
  id: string;
  runId: string;
  storyIndex: number;
  storyId: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  status: 'pending' | 'running' | 'done' | 'failed';
  output?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowName: string;
  task: string;
  status: RunStatus;
  context: Record<string, string>;
  runToken: string;
  steps: WorkflowRunStep[];
  stories: WorkflowStory[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRunSummary {
  id: string;
  workflowId: string;
  workflowName: string;
  task: string;
  status: RunStatus;
  stepCount: number;
  currentStep?: string;
  storyProgress?: { done: number; total: number };
  createdAt: string;
  updatedAt: string;
}

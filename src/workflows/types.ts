// Workflow definition — the template
export interface WorkflowStepDef {
  id: string;               // e.g. "plan", "implement", "verify"
  agentId: string;           // which agent handles this step
  inputTemplate: string;     // prompt template with {{var}} placeholders
  expects: string;           // what output format is expected
  type: 'single' | 'loop';
  loopConfig?: {
    over: 'stories';
    verifyEach?: boolean;
    verifyStep?: string;
  };
  maxRetries?: number;       // default 2
}

export interface WorkflowDef {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStepDef[];
  createdAt: string;
  updatedAt: string;
}

// Workflow run — an instance of a definition being executed
export type StepStatus = 'waiting' | 'pending' | 'running' | 'done' | 'failed';
export type RunStatus = 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface WorkflowRunStep {
  id: string;
  runId: string;
  stepId: string;          // references WorkflowStepDef.id
  agentId: string;
  stepIndex: number;
  inputTemplate: string;
  expects: string;
  type: 'single' | 'loop';
  loopConfig?: string;     // JSON string
  status: StepStatus;
  output?: string;
  retryCount: number;
  maxRetries: number;
  currentStoryId?: string;
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
  runToken: string;        // auth token for agents
  steps: WorkflowRunStep[];
  stories: WorkflowStory[];
  createdAt: string;
  updatedAt: string;
}

// Summaries for list views
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

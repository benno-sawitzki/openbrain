export interface Touch {
  date: string;
  note: string;
  type: 'call' | 'email' | 'dm' | 'meeting' | 'note';
}

export interface Lead {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  phone: string | null;
  source: string | null;
  stage: string;
  value: number;
  score: number;
  tags: string[];
  pipeline: string;
  touches: Touch[];
  followUp: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScoringRule {
  type: string;
  points: number;
}

export interface PipelineConfig {
  stages: string[];
}

export interface Config {
  pipelines: Record<string, PipelineConfig>;
  scoring: { rules: ScoringRule[] };
  stale: { days: number };
  csv: { mapping: Record<string, string> };
}

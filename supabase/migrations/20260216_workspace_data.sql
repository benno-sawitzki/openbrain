-- Workspace data: synced JSON blobs from local OpenClaw instances
CREATE TABLE IF NOT EXISTS public.workspace_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  data_type TEXT NOT NULL,  -- 'tasks', 'leads', 'content', 'activity', 'stats', 'config', 'inbox'
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, data_type)
);

-- RLS: users can read/write their own workspace data
ALTER TABLE public.workspace_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_data_select ON public.workspace_data
  FOR SELECT USING (workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid()));

CREATE POLICY workspace_data_insert ON public.workspace_data
  FOR INSERT WITH CHECK (workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid()));

CREATE POLICY workspace_data_update ON public.workspace_data
  FOR UPDATE USING (workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid()));

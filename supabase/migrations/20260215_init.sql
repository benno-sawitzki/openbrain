CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Open Claw',
  gateway_url TEXT,
  gateway_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_select ON public.workspaces FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY workspace_insert ON public.workspaces FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY workspace_update ON public.workspaces FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY workspace_delete ON public.workspaces FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.workspaces (user_id, name) VALUES (NEW.id, 'My Open Claw');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

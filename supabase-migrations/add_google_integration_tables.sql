-- supabase-migrations/add_google_integration_tables.sql
-- Create tables for GSuite/Gmail integration

-- 1. Google Connections (Stores OAuth tokens)
CREATE TABLE IF NOT EXISTS public.google_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expiry_date BIGINT, -- Timestamp in milliseconds
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id),
    UNIQUE(user_id)
);

-- 2. Pending Actions (Extracted from Gmail by AI)
CREATE TABLE IF NOT EXISTS public.pending_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    source_email_id TEXT NOT NULL, -- Gmail message path/id
    from_email TEXT,
    subject TEXT,
    title TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb, -- Store extracted fields (due_date, priority, etc.)
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'dismissed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, source_email_id)
);

-- Enable RLS
ALTER TABLE public.google_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_actions ENABLE ROW LEVEL SECURITY;

-- Policies for google_connections
CREATE POLICY "Users can view their own org's google connection" 
ON public.google_connections FOR SELECT 
USING (auth.uid() IN (
    SELECT id FROM public.users WHERE organization_id = google_connections.organization_id
));

CREATE POLICY "Users can manage their own org's google connection" 
ON public.google_connections FOR ALL 
USING (auth.uid() IN (
    SELECT id FROM public.users WHERE organization_id = google_connections.organization_id
));

-- Policies for pending_actions
CREATE POLICY "Users can view their own org's pending actions" 
ON public.pending_actions FOR SELECT 
USING (auth.uid() IN (
    SELECT id FROM public.users WHERE organization_id = pending_actions.organization_id
));

CREATE POLICY "Users can manage their own org's pending actions" 
ON public.pending_actions FOR ALL 
USING (auth.uid() IN (
    SELECT id FROM public.users WHERE organization_id = pending_actions.organization_id
));

-- Function to handle timestamp updates
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER set_updated_at_google_connections
BEFORE UPDATE ON public.google_connections
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_pending_actions
BEFORE UPDATE ON public.pending_actions
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Enable the UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles Table (extends Supabase auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    groq_api_key TEXT, -- Encrypted locally by the app if needed, or stored directly
    sarvam_api_key TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Agents Table
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    voice TEXT NOT NULL,
    table_instructions TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Agent Data Table
CREATE TABLE agent_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
    row_index INTEGER NOT NULL,
    column_key TEXT NOT NULL,
    cell_value TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Conversations Table
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Row Level Security (RLS) setup --

-- Profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
ON profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
ON profiles FOR INSERT
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
ON profiles FOR UPDATE
USING (auth.uid() = id);

-- Agents
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Builders can manage their own agents
CREATE POLICY "Builders can view their own agents"
ON agents FOR SELECT
USING (auth.uid() = owner_id);

CREATE POLICY "Builders can insert their own agents"
ON agents FOR INSERT
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Builders can update their own agents"
ON agents FOR UPDATE
USING (auth.uid() = owner_id);

CREATE POLICY "Builders can delete their own agents"
ON agents FOR DELETE
USING (auth.uid() = owner_id);

-- Public can view active agents by ID
CREATE POLICY "Public can view active agents"
ON agents FOR SELECT
USING (is_active = true);


-- Agent Data
ALTER TABLE agent_data ENABLE ROW LEVEL SECURITY;

-- Builders can manage data for their own agents
CREATE POLICY "Builders can view data for their own agents"
ON agent_data FOR SELECT
USING (
  EXISTS (SELECT 1 FROM agents WHERE agents.id = agent_data.agent_id AND agents.owner_id = auth.uid())
);

CREATE POLICY "Builders can insert data for their own agents"
ON agent_data FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM agents WHERE agents.id = agent_data.agent_id AND agents.owner_id = auth.uid())
);

CREATE POLICY "Builders can update data for their own agents"
ON agent_data FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM agents WHERE agents.id = agent_data.agent_id AND agents.owner_id = auth.uid())
);

CREATE POLICY "Builders can delete data for their own agents"
ON agent_data FOR DELETE
USING (
  EXISTS (SELECT 1 FROM agents WHERE agents.id = agent_data.agent_id AND agents.owner_id = auth.uid())
);

-- Service Role (API) can select/insert/update/delete for tool calls
-- Note: Service role automatically bypasses RLS unless specifically configured otherwise.
-- However, if using Anon or Authenticated roles for API routes via standard client, add policies:

CREATE POLICY "Anyone can view data for active agents via API"
ON agent_data FOR SELECT
USING (
  EXISTS (SELECT 1 FROM agents WHERE agents.id = agent_data.agent_id AND agents.is_active = true)
);

-- If modifying via Server API, make sure to use a Service Role Key to bypass RLS for Public users modifying the table,
-- OR grant insert/update to anon/authenticated for active agents (not recommended to expose directly to client).
-- We'll rely on the Next.js server route using a Service Role Key to allow the AI to update the table.


-- Conversations
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Builders can view conversations for their own agents
CREATE POLICY "Builders can view conversations for their agents"
ON conversations FOR SELECT
USING (
  EXISTS (SELECT 1 FROM agents WHERE agents.id = conversations.agent_id AND agents.owner_id = auth.uid())
);

CREATE POLICY "Builders can delete conversations for their agents"
ON conversations FOR DELETE
USING (
  EXISTS (SELECT 1 FROM agents WHERE agents.id = conversations.agent_id AND agents.owner_id = auth.uid())
);

-- Public API (Next.js server-side) will handle reading/writing conversations using its Supabase client (usually with anon or service_role).
-- Allowing everyone to insert conversations to any active agent API side:
CREATE POLICY "Anyone can insert conversations"
ON conversations FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM agents WHERE agents.id = conversations.agent_id AND agents.is_active = true)
);

-- Allowing anyone to view conversations matching a specific session_id
CREATE POLICY "Anyone can view conversations by session ID"
ON conversations FOR SELECT
USING (
  true -- The API route should filter manually by session_id and agent_id
);

-- Trigger to automatically create a profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Trigger for auto-updating updated_at on agent_data
CREATE OR REPLACE FUNCTION update_agent_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_agent_data_modtime
BEFORE UPDATE ON agent_data
FOR EACH ROW EXECUTE PROCEDURE update_agent_data_updated_at();

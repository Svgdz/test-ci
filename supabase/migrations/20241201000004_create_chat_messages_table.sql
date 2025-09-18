-- Create chat_messages table for storing chat history per project
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_project_id ON chat_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_project_user ON chat_messages(project_id, user_id);

-- Enable RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only access their own chat messages for projects they own
CREATE POLICY "Users can view their own chat messages for their projects" ON chat_messages
  FOR SELECT USING (
    user_id = auth.uid() AND
    project_id IN (
      SELECT id FROM projects WHERE account_id = auth.uid()
    )
  );

-- Users can insert their own chat messages for their projects
CREATE POLICY "Users can insert their own chat messages for their projects" ON chat_messages
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    project_id IN (
      SELECT id FROM projects WHERE account_id = auth.uid()
    )
  );

-- Users can update their own chat messages for their projects
CREATE POLICY "Users can update their own chat messages for their projects" ON chat_messages
  FOR UPDATE USING (
    user_id = auth.uid() AND
    project_id IN (
      SELECT id FROM projects WHERE account_id = auth.uid()
    )
  );

-- Users can delete their own chat messages for their projects
CREATE POLICY "Users can delete their own chat messages for their projects" ON chat_messages
  FOR DELETE USING (
    user_id = auth.uid() AND
    project_id IN (
      SELECT id FROM projects WHERE account_id = auth.uid()
    )
  );

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_chat_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_chat_messages_updated_at
  BEFORE UPDATE ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_messages_updated_at();

-- Add comments
COMMENT ON TABLE chat_messages IS 'Stores chat conversation history for each project';
COMMENT ON COLUMN chat_messages.project_id IS 'Reference to the project this chat belongs to';
COMMENT ON COLUMN chat_messages.user_id IS 'Reference to the user who sent/received this message';
COMMENT ON COLUMN chat_messages.role IS 'Role of the message sender (user, assistant, system)';
COMMENT ON COLUMN chat_messages.content IS 'The actual message content';

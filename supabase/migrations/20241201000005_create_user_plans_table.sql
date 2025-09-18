-- Create plans table first
CREATE TABLE IF NOT EXISTS plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  price_monthly DECIMAL(10,2) DEFAULT 0,
  price_yearly DECIMAL(10,2) DEFAULT 0,
  features JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Insert default free plan
INSERT INTO plans (name, description, price_monthly, price_yearly, features) 
VALUES (
  'free',
  'Free plan with basic features',
  0,
  0,
  '["Basic project creation", "Limited storage", "Community support"]'::jsonb
) ON CONFLICT (name) DO NOTHING;

-- Create user_plans table
CREATE TABLE IF NOT EXISTS user_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  start_date TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  end_date TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, plan_id, start_date)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_plans_user_id ON user_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_user_plans_plan_id ON user_plans(plan_id);
CREATE INDEX IF NOT EXISTS idx_user_plans_active ON user_plans(is_active);

-- Enable RLS
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_plans ENABLE ROW LEVEL SECURITY;

-- RLS policies for plans (public read)
CREATE POLICY "Anyone can view active plans" ON plans
  FOR SELECT USING (is_active = TRUE);

-- RLS policies for user_plans (users can only see their own)
CREATE POLICY "Users can view their own plans" ON user_plans
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update their own plans" ON user_plans
  FOR UPDATE USING (user_id = auth.uid());

-- Function to assign free plan to new users
CREATE OR REPLACE FUNCTION public.assign_free_plan_to_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_free_plan_id UUID;
BEGIN
  -- Get the free plan ID
  SELECT id INTO v_free_plan_id 
  FROM plans 
  WHERE name = 'free' AND is_active = TRUE 
  LIMIT 1;

  -- If free plan exists, assign it to the new user
  IF v_free_plan_id IS NOT NULL THEN
    INSERT INTO public.user_plans (
      user_id,
      plan_id,
      start_date,
      is_active
    ) VALUES (
      NEW.id,
      v_free_plan_id,
      NOW(),
      TRUE
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-assign free plan to new users
DROP TRIGGER IF EXISTS trigger_assign_free_plan_to_new_user ON auth.users;
CREATE TRIGGER trigger_assign_free_plan_to_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_free_plan_to_new_user();

-- Add comments
COMMENT ON TABLE plans IS 'Available subscription plans';
COMMENT ON TABLE user_plans IS 'User plan assignments and history';
COMMENT ON FUNCTION public.assign_free_plan_to_new_user() IS 'Automatically assigns free plan to new users';

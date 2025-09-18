-- Disable the user plans trigger if you don't need it
-- This is a quick fix to allow user creation without the user_plans table

-- Drop all related triggers first
DROP TRIGGER IF EXISTS trigger_assign_free_plan_to_new_user ON auth.users;
DROP TRIGGER IF EXISTS after_auth_user_created ON auth.users;

-- Drop the function with CASCADE to remove all dependencies
DROP FUNCTION IF EXISTS public.assign_free_plan_to_new_user() CASCADE;

-- Add comment
COMMENT ON SCHEMA public IS 'Disabled user plans auto-assignment for testing';

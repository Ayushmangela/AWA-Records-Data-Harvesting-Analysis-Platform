-- Setup script for creating the profiles table, enabling RLS, defining policies, 
-- and setting up the trigger to auto-create profiles on signup.
-- This can be run directly in the Supabase SQL editor.

-- 1. Create the profiles table in the public schema
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable Row Level Security (RLS) on the profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies
-- Policy A: Users can only SELECT their own row
DROP POLICY IF EXISTS "Users can only SELECT their own row" ON public.profiles;
CREATE POLICY "Users can only SELECT their own row"
ON public.profiles
FOR SELECT
USING (auth.uid() = id);

-- Policy B: Users can only UPDATE their own row
DROP POLICY IF EXISTS "Users can only UPDATE their own row" ON public.profiles;
CREATE POLICY "Users can only UPDATE their own row"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Note: Since RLS is enabled and there is no DELETE policy, DELETE operations on profiles are disallowed for users.
-- Insert is allowed only on signup via a trigger, which runs as SECURITY DEFINER and bypasses RLS policies.

-- 4. Create trigger function to auto-insert a profile on auth.users signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email, role)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', ''),
        COALESCE(new.email, ''),
        'user'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 5. Attach the trigger function to the auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

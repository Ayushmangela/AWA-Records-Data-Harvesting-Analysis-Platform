"""create_profiles_table

Revision ID: e791e28031ed
Revises: fbd54be62496
Create Date: 2026-05-29 09:39:04.166663

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e791e28031ed'
down_revision: Union[str, Sequence[str], None] = 'fbd54be62496'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Check if we are running in an environment where auth schema/users already exist (like live Supabase)
    bind = op.get_bind()
    insp = sa.inspect(bind)
    schema_exists = 'auth' in insp.get_schema_names()
    
    if not schema_exists:
        op.execute("CREATE SCHEMA IF NOT EXISTS auth;")
        op.execute("""
            CREATE TABLE IF NOT EXISTS auth.users (
                id UUID PRIMARY KEY,
                email VARCHAR(255),
                raw_user_meta_data JSONB
            );
        """)
    else:
        # Check if auth.users table exists
        tables = insp.get_table_names(schema='auth')
        if 'users' not in tables:
            op.execute("""
                CREATE TABLE IF NOT EXISTS auth.users (
                    id UUID PRIMARY KEY,
                    email VARCHAR(255),
                    raw_user_meta_data JSONB
                );
            """)

    # Check if auth.uid() exists
    uid_exists = False
    if schema_exists:
        try:
            result = bind.execute(sa.text("""
                SELECT 1 
                FROM pg_proc p 
                JOIN pg_namespace n ON p.pronamespace = n.oid 
                WHERE n.nspname = 'auth' AND p.proname = 'uid';
            """)).fetchone()
            if result:
                uid_exists = True
        except Exception:
            pass

    if not uid_exists:
        op.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 
                    FROM pg_proc p 
                    JOIN pg_namespace n ON p.pronamespace = n.oid 
                    WHERE n.nspname = 'auth' AND p.proname = 'uid'
                ) THEN
                    CREATE FUNCTION auth.uid() RETURNS uuid AS 'SELECT null::uuid;' LANGUAGE sql STABLE;
                END IF;
            END;
            $$;
        """)

    # Create profiles table
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.profiles (
            id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
            full_name TEXT NOT NULL,
            email TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            created_at TIMESTAMPTZ DEFAULT now()
        );
    """)

    # Enable Row Level Security (RLS)
    op.execute("ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;")

    # Drop existing policies if any
    op.execute('DROP POLICY IF EXISTS "Users can only SELECT their own row" ON public.profiles;')
    op.execute('DROP POLICY IF EXISTS "Users can only UPDATE their own row" ON public.profiles;')

    # Create RLS Policies
    op.execute("""
        CREATE POLICY "Users can only SELECT their own row"
        ON public.profiles
        FOR SELECT
        USING (auth.uid() = id);
    """)

    op.execute("""
        CREATE POLICY "Users can only UPDATE their own row"
        ON public.profiles
        FOR UPDATE
        USING (auth.uid() = id)
        WITH CHECK (auth.uid() = id);
    """)

    # Create Postgres trigger function
    op.execute("""
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
    """)

    # Drop the trigger first if it exists, to ensure it gets recreated cleanly
    op.execute("DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;")
    op.execute("""
        CREATE TRIGGER on_auth_user_created
            AFTER INSERT ON auth.users
            FOR EACH ROW
            EXECUTE FUNCTION public.handle_new_user();
    """)


def downgrade() -> None:
    # Drop trigger
    op.execute("DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;")
    # Drop trigger function
    op.execute("DROP FUNCTION IF EXISTS public.handle_new_user();")
    # Drop policies
    op.execute('DROP POLICY IF EXISTS "Users can only SELECT their own row" ON public.profiles;')
    op.execute('DROP POLICY IF EXISTS "Users can only UPDATE their own row" ON public.profiles;')
    # Drop table
    op.execute("DROP TABLE IF EXISTS public.profiles;")

-- Script to set password for cielo1304@gmail.com
-- This requires Supabase admin access

DO $$
DECLARE
  user_id uuid;
  hashed_password text;
BEGIN
  -- Find the user by email
  SELECT id INTO user_id 
  FROM auth.users 
  WHERE email = 'cielo1304@gmail.com' 
  LIMIT 1;

  IF user_id IS NULL THEN
    RAISE EXCEPTION 'User with email cielo1304@gmail.com not found';
  END IF;

  -- Hash the password using pgcrypto (password: 123456aa)
  -- Supabase uses bcrypt for password hashing
  -- We'll use the built-in password hashing
  hashed_password := crypt('123456aa', gen_salt('bf'));

  -- Update the user password
  UPDATE auth.users 
  SET encrypted_password = hashed_password,
      updated_at = now()
  WHERE id = user_id;

  RAISE NOTICE 'Password updated successfully for user: %', user_id;
END $$;

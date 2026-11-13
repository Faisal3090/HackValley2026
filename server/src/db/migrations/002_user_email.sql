ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email TEXT;

UPDATE users
SET email = username
WHERE email IS NULL
  AND username ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$';

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
  ON users (lower(email))
  WHERE email IS NOT NULL;

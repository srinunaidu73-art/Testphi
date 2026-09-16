/*
# Backfill environments for existing projects

1. Purpose
- Some projects were created before environments were auto-created, so they have
  no dev/staging/prod rows. Settings and the run screen depend on these rows, so
  those projects could not configure a website URL or login credentials.

2. Changes
- Insert a dev, staging, and prod environment row for every project that does
  not already have one. URLs start empty so the user can fill them in Settings.

3. Security
- No policy changes. Existing RLS on `environments` already allows anon writes.
*/

INSERT INTO environments (project_id, name, url)
SELECT p.id, env.name, ''
FROM projects p
CROSS JOIN (VALUES ('dev'), ('staging'), ('prod')) AS env(name)
WHERE NOT EXISTS (
  SELECT 1 FROM environments e
  WHERE e.project_id = p.id AND e.name = env.name
);

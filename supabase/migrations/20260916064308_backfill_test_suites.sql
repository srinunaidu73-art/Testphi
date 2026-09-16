/*
# Backfill test suites for existing projects

1. Purpose
- Projects created before suite auto-creation have no smoke/sanity/regression
  suites, so the Execution page silently does nothing when Start Run is clicked.

2. Changes
- Insert smoke, sanity, and regression suites for every project missing them.
- Populate suite_memberships so each suite contains all of the project's test cases.

3. Security
- No policy changes. Existing RLS already allows anon writes.
*/

INSERT INTO test_suites (project_id, name, suite_type, auto_generated, estimated_duration_min)
SELECT p.id, s.name, s.suite_type, true, s.dur
FROM projects p
CROSS JOIN (
  VALUES
    ('Smoke Suite', 'smoke', 5),
    ('Sanity Suite', 'sanity', 15),
    ('Regression Suite', 'regression', 45)
) AS s(name, suite_type, dur)
WHERE NOT EXISTS (
  SELECT 1 FROM test_suites ts
  WHERE ts.project_id = p.id AND ts.suite_type = s.suite_type
);

-- Link all existing test cases into each suite for their project
INSERT INTO suite_memberships (suite_id, test_case_id, sort_order)
SELECT ts.id, tc.id, row_number() OVER (PARTITION BY ts.id ORDER BY tc.created_at) - 1
FROM test_suites ts
JOIN test_cases tc ON tc.project_id = ts.project_id
WHERE NOT EXISTS (
  SELECT 1 FROM suite_memberships sm
  WHERE sm.suite_id = ts.id AND sm.test_case_id = tc.id
);

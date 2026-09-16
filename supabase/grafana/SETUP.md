# TestPhi Grafana Dashboard Setup

## Step 1: Create a read-only database role

Connect to your Supabase Postgres database and run:

```sql
CREATE ROLE grafana_reader WITH LOGIN PASSWORD 'your_secure_password';
GRANT CONNECT ON DATABASE postgres TO grafana_reader;
GRANT USAGE ON SCHEMA public TO grafana_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO grafana_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO grafana_reader;
```

## Step 2: Add PostgreSQL data source in Grafana

1. Open Grafana → Configuration → Data Sources → Add data source
2. Select PostgreSQL
3. Configure:
   - Host: `db.[your-project].supabase.co:5432`
   - Database: `postgres`
   - User: `grafana_reader`
   - Password: `your_secure_password`
   - SSL Mode: `require`
4. Click Save & Test

## Step 3: Import the dashboard

1. Open Grafana → Dashboards → Import
2. Upload `testphi-dashboard.json` from this directory
3. Select your PostgreSQL data source
4. Click Import

## Available Panels

| Panel | Type | Description |
|-------|------|-------------|
| Pass Rate Trend | Time series | Pass rate % over last 30 runs |
| Tests Passed vs Failed | Bar chart | Pass/fail/skip counts per run |
| Suite Execution Duration | Time series | Duration in minutes per run |
| Flaky Tests | Table | Tests with flaky score > 20% |
| Requirements Coverage | Gauge | % of requirements with test coverage |
| Uncovered Requirements | Table | Requirements without any test cases |
| Defects by Severity | Pie chart | Open defects grouped by severity |
| Defects by Status | Bar chart | All defects grouped by status |
| Validation Score Distribution | Histogram | Distribution of validation scores |
| CI/CD Run History | Table | Recent CI/CD-triggered runs |
| Tests per Suite | Bar chart | Test count per suite |
| Recent Test Runs | Table | Last 20 test runs with details |

## Custom Queries

You can create additional panels using these common query patterns:

### Pass rate by suite type
```sql
SELECT suite_type, ROUND(AVG(passed::float / NULLIF(total_cases, 0)) * 100, 1) AS avg_pass_rate
FROM test_runs WHERE status = 'completed'
GROUP BY suite_type;
```

### Most flaky tests (top 10)
```sql
SELECT title, flaky_score, test_type, category
FROM test_cases WHERE flaky_score > 0
ORDER BY flaky_score DESC LIMIT 10;
```

### Defect discovery rate (per day)
```sql
SELECT DATE(created_at) AS day, COUNT(*) AS defects_found
FROM defects GROUP BY day ORDER BY day DESC LIMIT 30;
```

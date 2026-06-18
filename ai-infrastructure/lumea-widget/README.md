# Lumea — Churn Risk Panel

Single-file React component (`ChurnRiskPanel.jsx`) in the Warm Ivory Editorial
style. Drops into the Lumea CRM to surface the churn predictor's output.

```jsx
import ChurnRiskPanel from "./lumea-widget/ChurnRiskPanel";

// With your existing Supabase client (RLS keeps it tenant-scoped):
<ChurnRiskPanel supabase={supabase} />

// Standalone preview (renders mock data):
<ChurnRiskPanel />
```

Data source: `public.account_churn_profile` embedding `b2b_partners(agency_name,
email, status)` via the FK, ordered by worst sentiment trend then score. Falls
back to representative mock rows when no `supabase` prop is passed.

No external deps beyond React. Verified to compile with esbuild (JSX loader).

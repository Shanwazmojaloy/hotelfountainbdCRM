# Hotel Fountain CRM - Project Guidelines (HF-Core)

## Core Business Logic
- **Ledger Filtering:** A row must ONLY appear on the Daily Report if:
    - `(Paid > 0 OR Due > 0)` AND `(Payment/Record Date == Today)`.
    - Prevent "ghost rows" (rooms with 0 balance appearing on today's report).
- **Billing Calculation:** Total Dues = (Previous Dues + Today's Charges) - Today's Payments.

## Access Control (Role Security)
- **Front Desk:** Strictly NO access to SEO or GEO Agent tools.
- **Admin:** Full access to all modules including AI Leads and Marketing.

## Key Features & Modules
- **AI Leads Tab:** Active module for lead management.
- **Billing Ledger:** Core financial tracking with strict date-filtering.
- **Saturday Schedule:** Automation/Reporting scheduled for weekly Saturdays.

## Technical Standards
- **Git Flow:** Use `Remove-Item .git/*.lock` before commits to prevent terminal hangs in the local environment.
- **Commit Pattern:** Use `feat:` for new features and `fix:` for logic corrections.
- **Frontend:** Maintain the integrated `crm.html` structure.

## Memory Trigger
- When requested with **"HF-Fix"** or **"HF-Core"**, apply all above rules to any code generation.

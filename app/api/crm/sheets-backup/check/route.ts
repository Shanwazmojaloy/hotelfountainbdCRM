// POST /api/crm/sheets-backup/check
// Returns { exists: boolean } — used by the CRM to decide overwrite vs append prompt.
// Session-gated + per-tenant spreadsheet (2026-07-04), mirroring ../route.ts.

import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { requireSession } from '@/lib/session'
import { getTenantById } from '@/lib/tenant'

const ENV_TENANT = process.env.NEXT_PUBLIC_TENANT_ID || '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'
const HOME_TENANT = '46bbc3ff-b1ef-4d54-87be-3ecd0eb635a8'
const HOME_SPREADSHEET_ID =
  process.env.SHEETS_BACKUP_ID || '1MjqNY4_q78xldaA3M8pnFEFI7RiPwGh0npA-EDiYwas'

export async function POST(req: NextRequest) {
  try {
    const sess = requireSession(req)
    if (!sess) return NextResponse.json({ exists: false })
    const TENANT = sess.tenant_id || ENV_TENANT
    const tenant = await getTenantById(TENANT)
    const SPREADSHEET_ID =
      tenant?.sheets_backup_id || (TENANT === HOME_TENANT ? HOME_SPREADSHEET_ID : null)
    if (!SPREADSHEET_ID) return NextResponse.json({ exists: false })

    const saKey = process.env.GOOGLE_SA_KEY
    if (!saKey) return NextResponse.json({ exists: false })

    const { sheetName } = (await req.json()) as { sheetName: string }

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(saKey),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })

    const sheets = google.sheets({ version: 'v4', auth })
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
    const exists = !!meta.data.sheets?.find(s => s.properties?.title === sheetName)

    return NextResponse.json({ exists })
  } catch {
    return NextResponse.json({ exists: false })
  }
}

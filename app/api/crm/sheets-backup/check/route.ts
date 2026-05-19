// POST /api/crm/sheets-backup/check
// Returns { exists: boolean } — used by the CRM to decide overwrite vs append prompt.

import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

const SPREADSHEET_ID =
  process.env.SHEETS_BACKUP_ID || '1MjqNY4_q78xldaA3M8pnFEFI7RiPwGh0npA-EDiYwas'

export async function POST(req: NextRequest) {
  try {
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

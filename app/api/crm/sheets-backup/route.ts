// ─────────────────────────────────────────────────────────────────────────────
// POST /api/crm/sheets-backup
//
// Writes the daily closing ledger to the TENANT'S Google Sheets backup file.
// Called by doClosingComplete() in crm-src.jsx after fiscal day close (browser
// fetch is same-origin, so the lumea_sess cookie rides along).
//
// Body: { sheetName: "DD-MM-YYYY", wsData: any[][], overwrite: boolean }
//
// Session-gated (2026-07-04 — was previously unauthenticated behind the IP
// perimeter only). Destination resolution:
//   tenants.sheets_backup_id (per client, set at onboarding)
//   → env SHEETS_BACKUP_ID / legacy hardcoded id, HOME TENANT ONLY
//   → other tenants without a configured sheet get a soft 'skipped' response —
//     a client's closing data must never land in Hotel Fountain's spreadsheet.
//
// Env vars required (set in Vercel):
//   GOOGLE_SA_KEY — full service account JSON (stringified). Each tenant shares
//                   their spreadsheet with this service account's client_email
//                   (Editor) at onboarding.
// ─────────────────────────────────────────────────────────────────────────────

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
    if (!sess) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
    const TENANT = sess.tenant_id || ENV_TENANT

    // Per-tenant destination (service-role lookup, 60s-cached).
    const tenant = await getTenantById(TENANT)
    const SPREADSHEET_ID =
      tenant?.sheets_backup_id || (TENANT === HOME_TENANT ? HOME_SPREADSHEET_ID : null)
    if (!SPREADSHEET_ID) {
      // Soft skip: closing must not fail because a client has no sheet configured yet.
      return NextResponse.json({ ok: false, skipped: true, error: 'No backup spreadsheet configured for this property.' })
    }

    const saKey = process.env.GOOGLE_SA_KEY
    if (!saKey) {
      return NextResponse.json(
        { ok: false, error: 'GOOGLE_SA_KEY env var not configured' },
        { status: 503 }
      )
    }

    const { sheetName, wsData, overwrite } = (await req.json()) as {
      sheetName: string
      wsData: (string | number)[][]
      overwrite: boolean
    }

    if (!sheetName || !Array.isArray(wsData)) {
      return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 })
    }

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(saKey),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })

    const sheets = google.sheets({ version: 'v4', auth })

    // ── Check if sheet tab already exists ──────────────────────────────────
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
    const existing = meta.data.sheets?.find(
      s => s.properties?.title === sheetName
    )

    if (!existing) {
      // Create new sheet tab
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: sheetName } } }],
        },
      })
      // Write data to new sheet
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${sheetName}'!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: wsData },
      })
    } else if (overwrite) {
      // Clear existing sheet then rewrite
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${sheetName}'!A:Z`,
      })
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${sheetName}'!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: wsData },
      })
    } else {
      // Append below existing data
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${sheetName}'!A1`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [[''], ['— Appended Closing —'], ...wsData.slice(6)], // skip header rows, append data only
        },
      })
    }

    // ── Bold the header row (row 6 = table column headers) ─────────────────
    // Only on new sheet or overwrite — not append
    if (!existing || overwrite) {
      const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
      const tab = sheetMeta.data.sheets?.find(s => s.properties?.title === sheetName)
      const tabId = tab?.properties?.sheetId
      if (tabId !== undefined) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            requests: [
              {
                // Bold row 1 (hotel name title)
                repeatCell: {
                  range: { sheetId: tabId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 9 },
                  cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 13 } } },
                  fields: 'userEnteredFormat.textFormat',
                },
              },
              {
                // Bold KPI row (row 4, index 3)
                repeatCell: {
                  range: { sheetId: tabId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 9 },
                  cell: { userEnteredFormat: { textFormat: { bold: true } } },
                  fields: 'userEnteredFormat.textFormat',
                },
              },
              {
                // Bold + background for column headers row (row 6, index 5)
                repeatCell: {
                  range: { sheetId: tabId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 9 },
                  cell: {
                    userEnteredFormat: {
                      textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                      backgroundColor: { red: 0.1, green: 0.1, blue: 0.1 },
                    },
                  },
                  fields: 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
                },
              },
            ],
          },
        })
      }
    }

    return NextResponse.json({ ok: true, sheetName, spreadsheetId: SPREADSHEET_ID })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[sheets-backup]', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

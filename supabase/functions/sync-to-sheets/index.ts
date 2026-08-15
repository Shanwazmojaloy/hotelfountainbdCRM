import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SPREADSHEET_ID = Deno.env.get('GOOGLE_SPREADSHEET_ID') ?? ''

async function getServiceAccount(): Promise<Record<string,string>> {
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set')
  return JSON.parse(raw)
}

async function getGoogleAccessToken(sa: Record<string,string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const h = btoa(JSON.stringify({alg:'RS256',typ:'JWT'})).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
  const p = btoa(JSON.stringify({iss:sa.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600})).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
  const si = `${h}.${p}`
  const pem = sa.private_key.replace(/\\n/g,'\n')
  const kd = pem.replace('-----BEGIN PRIVATE KEY-----','').replace('-----END PRIVATE KEY-----','').replace(/\s/g,'')
  const bk = Uint8Array.from(atob(kd),c=>c.charCodeAt(0))
  const ck = await crypto.subtle.importKey('pkcs8',bk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5',ck,new TextEncoder().encode(si))
  const sb64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
  const jwt = `${si}.${sb64}`
  const resp = await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`})
  const tok = await resp.json()
  if (!tok.access_token) throw new Error(`OAuth failed: ${JSON.stringify(tok)}`)
  return tok.access_token
}

// Retry on Google Sheets rate-limit (429) and transient 5xx with exponential backoff + jitter.
async function sheetsReq(token: string, sid: string, method: string, path: string, body?: unknown, attempt = 0): Promise<any> {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sid}${path}`,{
    method, headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body: body ? JSON.stringify(body) : undefined
  })
  const t = await r.text()
  if (!r.ok) {
    if ((r.status === 429 || r.status >= 500) && attempt < 5) {
      const wait = Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250)
      await new Promise(res => setTimeout(res, wait))
      return sheetsReq(token, sid, method, path, body, attempt + 1)
    }
    throw new Error(`Sheets ${r.status}: ${t}`)
  }
  return t ? JSON.parse(t) : {}
}

const TABLES: Record<string,{sheet:string;headers:string[]}> = {
  rooms: { sheet:'🛏 Rooms', headers:['id','room_number','category','price','status','floor','beds','view'] },
  guests: { sheet:'👤 Guests', headers:['id','name','phone','email','id_type','nationality','outstanding_balance','vip','total_stays','total_spent'] },
  reservations: { sheet:'📅 Reservations', headers:['id','guest_ids','room_ids','check_in','check_out','status','total_amount','paid_amount','payment_method','created_at'] },
  transactions: { sheet:'💰 Transactions', headers:['id','timestamp','fiscal_day','room_number','guest_name','type','amount','reservation_id'] },
  folios: { sheet:'🧾 Folios', headers:['id','reservation_id','room_number','description','category','amount','created_at'] },
  housekeeping_tasks: { sheet:'🧹 Housekeeping', headers:['id','room_number','task_type','priority','assignee','status','notes','created_at'] }
}

const TABLE_SHEETS = new Set([...Object.values(TABLES).map(t=>t.sheet), '📊 Sync Log'])

async function fullSync(token: string, sid: string) {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const counts: Record<string,number> = {}

  const ss = await sheetsReq(token, sid, 'GET', '')
  const existingSheets: {title:string;sheetId:number}[] =
    (ss.sheets||[]).map((s:{properties:{title:string;sheetId:number}}) => ({
      title: s.properties.title, sheetId: s.properties.sheetId
    }))
  const existingMap = new Map(existingSheets.map(s => [s.title, s]))

  // DRAIN: resize all existing data sheets to 2x2 to free 10M cell quota
  const drainRequests = existingSheets
    .filter(s => TABLE_SHEETS.has(s.title))
    .map(s => ({ updateSheetProperties: {
      properties: { sheetId: s.sheetId, gridProperties: { rowCount: 2, columnCount: 2 } },
      fields: 'gridProperties.rowCount,gridProperties.columnCount'
    }}))
  if (drainRequests.length > 0) {
    await sheetsReq(token, sid, 'POST', ':batchUpdate', { requests: drainRequests })
  }

  for (const [table, cfg] of Object.entries(TABLES)) {
    const { data } = await sb.from(table).select('*').limit(2000)
    const rows = data || []
    counts[table] = rows.length
    const needRows = Math.max(rows.length + 1, 2)
    const needCols = cfg.headers.length
    const existing = existingMap.get(cfg.sheet)

    if (existing) {
      await sheetsReq(token, sid, 'POST', ':batchUpdate', {
        requests: [{ updateSheetProperties: {
          properties: { sheetId: existing.sheetId, gridProperties: { rowCount: needRows, columnCount: needCols } },
          fields: 'gridProperties.rowCount,gridProperties.columnCount'
        }}]
      })
      await sheetsReq(token, sid, 'POST', `/values/${encodeURIComponent(cfg.sheet)}:clear`, {})
    } else {
      await sheetsReq(token, sid, 'POST', ':batchUpdate', {
        requests: [{ addSheet: { properties: { title: cfg.sheet, gridProperties: { rowCount: needRows, columnCount: needCols } }}}]
      })
    }

    const values = [
      cfg.headers,
      ...rows.map(row => cfg.headers.map(h => {
        const v = (row as Record<string,unknown>)[h]
        if (v===null||v===undefined) return ''
        if (Array.isArray(v)||typeof v==='object') return JSON.stringify(v)
        return String(v)
      }))
    ]
    await sheetsReq(token, sid, 'PUT',
      `/values/${encodeURIComponent(cfg.sheet)}!A1?valueInputOption=RAW`,
      { values }
    )
  }

  const now = new Date().toISOString()
  const logHeaders = ['synced_at','rooms','guests','reservations','transactions','folios','housekeeping']
  const logExisting = existingMap.get('📊 Sync Log')
  if (logExisting) {
    await sheetsReq(token, sid, 'POST', ':batchUpdate', {
      requests: [{ updateSheetProperties: {
        properties: { sheetId: logExisting.sheetId, gridProperties: { rowCount: 1002, columnCount: logHeaders.length } },
        fields: 'gridProperties.rowCount,gridProperties.columnCount'
      }}]
    })
  } else {
    await sheetsReq(token, sid, 'POST', ':batchUpdate', {
      requests: [{ addSheet: { properties: { title: '📊 Sync Log', gridProperties: { rowCount: 1002, columnCount: logHeaders.length } } } }]
    })
  }
  await sheetsReq(token, sid, 'POST',
    `/values/${encodeURIComponent('📊 Sync Log')}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { values: [logHeaders, [now, counts.rooms, counts.guests, counts.reservations, counts.transactions, counts.folios, counts.housekeeping_tasks]] }
  )
  return { synced_at: now, counts }
}

Deno.serve(async (req: Request) => {
  const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Content-Type':'application/json'}
  if (req.method==='OPTIONS') return new Response('ok',{headers:cors})

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Concurrency guard: single-row TTL lease. Per-statement triggers can still fire
  // overlapping invocations; only one may hold the lease at a time. Losers no-op (200)
  // instead of colliding on shared Google Sheet structure / blowing the write quota.
  const nowIso = new Date().toISOString()
  const leaseUntil = new Date(Date.now() + 120000).toISOString()
  let haveLease = false
  try {
    const { data: lease, error: leaseErr } = await sb
      .from('sheets_sync_lock')
      .update({ locked_until: leaseUntil, locked_at: nowIso })
      .eq('id', 1)
      .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
      .select()
    if (leaseErr) {
      // Fail open if the lock table is unreadable, but log it.
      console.error('Lease acquire error:', leaseErr)
      haveLease = true
    } else if (lease && lease.length > 0) {
      haveLease = true
    }
  } catch (e) {
    console.error('Lease acquire threw:', e)
    haveLease = true
  }

  if (!haveLease) {
    return new Response(JSON.stringify({ success:true, skipped:true, reason:'sync already running' }), { headers: cors })
  }

  try {
    const sa = await getServiceAccount()
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SPREADSHEET_ID not set')
    const token = await getGoogleAccessToken(sa)
    const result = await fullSync(token, SPREADSHEET_ID)
    return new Response(JSON.stringify({success:true,...result}),{headers:cors})
  } catch(err) {
    console.error('Sync error:',err)
    return new Response(JSON.stringify({error:String(err)}),{status:500,headers:cors})
  } finally {
    // Release the lease (best-effort).
    try { await sb.from('sheets_sync_lock').update({ locked_until: null }).eq('id', 1) } catch (_) { /* ignore */ }
  }
})

import { NextResponse } from 'next/server';
import { getHardwareIds, buildDeviceFingerprint } from '@/lib/hardware';
import { checkDeviceAuthorised } from '@/services/supabase';
import { HardwareCheckResult } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.HARDWARE_CHECK_BYPASS === 'true') {
    return NextResponse.json({ authorized: true, read_only: false, reason: 'Bypassed via env var.' } as HardwareCheckResult);
  }

  try {
    const ids = await getHardwareIds();
    const fingerprint = buildDeviceFingerprint(ids);

    if (!ids.macAddress && !ids.motherboardUUID) {
      return NextResponse.json({ authorized: false, read_only: true, reason: 'Could not read hardware identifiers.' } as HardwareCheckResult, { status: 403 });
    }

    const device = await checkDeviceAuthorised(ids.macAddress, ids.motherboardUUID);

    if (!device) {
      console.warn(`[HardwareCheck] Unauthorised device: ${fingerprint}`);
      return NextResponse.json({ authorized: false, read_only: true, reason: `Device ${fingerprint} is not whitelisted.` } as HardwareCheckResult, { status: 403 });
    }

    return NextResponse.json({ authorized: true, read_only: false, device, reason: `Device "${device.device_name}" is authorised.` } as HardwareCheckResult);
  } catch (err) {
    console.error('[HardwareCheck] Error:', err);
    return NextResponse.json({ authorized: false, read_only: true, reason: 'Internal error.' } as HardwareCheckResult, { status: 500 });
  }
}

export async function POST(req: Request) {
  const adminSecret = req.headers.get('x-admin-secret');
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { mac_address, motherboard_uuid, device_name } = body;
    if (!device_name) return NextResponse.json({ error: 'device_name is required' }, { status: 400 });

    const { registerDevice } = await import('@/services/supabase');
    const device = await registerDevice({ mac_address: mac_address ?? null, motherboard_uuid: motherboard_uuid ?? null, device_name, is_authorized: true });
    return NextResponse.json({ success: true, device });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

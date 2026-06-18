import { NextResponse } from 'next/server';
import { getAllNotifications, getUnreadNotifications, markNotificationRead, markAllNotificationsRead } from '@/services/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get('unread') === 'true';
  try {
    const notifications = unreadOnly ? await getUnreadNotifications() : await getAllNotifications();
    return NextResponse.json({ notifications, count: notifications.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.mark_all_read) {
      await markAllNotificationsRead();
      return NextResponse.json({ success: true });
    }
    if (body.id) {
      await markNotificationRead(body.id);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Provide id or mark_all_read.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

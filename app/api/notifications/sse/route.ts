export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const POLL_INTERVAL_MS = 8_000;
const MAX_DURATION_MS = 20_000;

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
      };

      send({ event: 'connected', message: 'Notification stream active.' });

      const { getUnreadNotifications } = await import('@/services/supabase');
      let elapsed = 0;

      while (elapsed < MAX_DURATION_MS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        elapsed += POLL_INTERVAL_MS;
        try {
          const unread = await getUnreadNotifications();
          send({ event: 'notification_update', unread_count: unread.length, notifications: unread.slice(0, 5), timestamp: new Date().toISOString() });
        } catch (err) {
          send({ event: 'error', message: String(err) });
        }
      }

      send({ event: 'reconnect', message: 'Stream ended – please reconnect.' });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

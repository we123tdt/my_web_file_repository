export async function onRequest(context) {
    const { request, env } = context;

    const TIMEOUT = 30 * 1000;

    try {
        if (!env.VISITOR_KV) {
            return new Response(JSON.stringify({
                count: 1,
                fallback: true
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (request.method === 'POST') {
            const body = await request.json();
            const userId = body.userId;

            if (!userId) {
                return new Response(JSON.stringify({
                    success: false,
                    error: '缺少用户ID'
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            let onlineUsers = {};
            const stored = await env.VISITOR_KV.get('online_users');
            if (stored) {
                try {
                    onlineUsers = JSON.parse(stored);
                } catch (e) {}
            }

            onlineUsers[userId] = Date.now();

            const now = Date.now();
            for (const id in onlineUsers) {
                if (now - onlineUsers[id] > TIMEOUT) {
                    delete onlineUsers[id];
                }
            }

            await env.VISITOR_KV.put('online_users', JSON.stringify(onlineUsers));

            return new Response(JSON.stringify({
                success: true,
                count: Object.keys(onlineUsers).length
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        } else {
            let onlineUsers = {};
            const stored = await env.VISITOR_KV.get('online_users');
            if (stored) {
                try {
                    onlineUsers = JSON.parse(stored);
                } catch (e) {}
            }

            const now = Date.now();
            let count = 0;
            for (const id in onlineUsers) {
                if (now - onlineUsers[id] <= TIMEOUT) {
                    count++;
                }
            }

            return new Response(JSON.stringify({
                success: true,
                count: count
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            count: 1,
            error: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

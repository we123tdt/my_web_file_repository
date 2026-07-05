export async function onRequest(context) {
    const { request, env } = context;

    try {
        if (!env.VISITOR_KV) {
            return new Response(JSON.stringify({
                success: false,
                error: 'KV未配置'
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (request.method === 'GET') {
            const stored = await env.VISITOR_KV.get('messages');
            let messages = [];
            if (stored) {
                try {
                    messages = JSON.parse(stored);
                } catch (e) {}
            }
            // 按时间倒序，最新在前
            messages.sort((a, b) => b.timestamp - a.timestamp);
            // 最多返回200条
            return new Response(JSON.stringify({
                success: true,
                messages: messages.slice(0, 200)
            }), {
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store'
                }
            });
        }

        // ===== DELETE: 删除留言（需登录） =====
        if (request.method === 'DELETE') {
            const authHeader = request.headers.get('Authorization') || '';
            const token = authHeader.replace('Bearer ', '');
            // 验证 token（简单内联验证，避免循环依赖）
            let isAuthed = false;
            if (token) {
                const sessionData = await env.VISITOR_KV.get(`session_${token}`);
                if (sessionData) {
                    try {
                        const session = JSON.parse(sessionData);
                        if (session.expires > Date.now()) isAuthed = true;
                    } catch (e) {}
                }
            }
            if (!isAuthed) {
                return new Response(JSON.stringify({ success: false, error: '请先登录' }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            const url = new URL(request.url);
            const msgId = url.searchParams.get('id');
            if (!msgId) {
                return new Response(JSON.stringify({ success: false, error: '缺少消息ID' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            const stored = await env.VISITOR_KV.get('messages');
            let messages = [];
            if (stored) { try { messages = JSON.parse(stored); } catch (e) {} }
            const before = messages.length;
            messages = messages.filter(m => m.id !== msgId);
            if (messages.length === before) {
                return new Response(JSON.stringify({ success: false, error: '留言不存在' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            await env.VISITOR_KV.put('messages', JSON.stringify(messages));
            return new Response(JSON.stringify({ success: true }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (request.method === 'POST') {
            const body = await request.json();
            const { nickname, content } = body;

            if (!content || !content.trim()) {
                return new Response(JSON.stringify({
                    success: false,
                    error: '留言内容不能为空'
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            if (content.length > 500) {
                return new Response(JSON.stringify({
                    success: false,
                    error: '留言内容不能超过500字'
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            const name = (nickname || '').trim().slice(0, 20) || '匿名访客';

            let messages = [];
            const stored = await env.VISITOR_KV.get('messages');
            if (stored) {
                try {
                    messages = JSON.parse(stored);
                } catch (e) {}
            }

            const newMessage = {
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 6),
                nickname: name,
                content: content.trim(),
                timestamp: Date.now()
            };

            messages.push(newMessage);

            // 最多保留500条留言
            if (messages.length > 500) {
                messages = messages.slice(-500);
            }

            await env.VISITOR_KV.put('messages', JSON.stringify(messages));

            return new Response(JSON.stringify({
                success: true,
                message: newMessage
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

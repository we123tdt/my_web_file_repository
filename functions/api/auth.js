// 简单登录系统
// POST { password } → 验证密码 → 返回 session token
// GET / POST { action: 'verify', token } → 验证 token 是否有效
// POST { action: 'logout', token } → 销毁 session

function generateToken() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 48; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return 'ap_' + result;
}

// 默认密码（首次使用时设置，也可通过 KV 自定义）
const DEFAULT_PASSWORD = 'admin123';

async function getAdminPassword(env) {
    if (!env.VISITOR_KV) return DEFAULT_PASSWORD;
    const config = await env.VISITOR_KV.get('admin_config');
    if (config) {
        try {
            const parsed = JSON.parse(config);
            return parsed.password || DEFAULT_PASSWORD;
        } catch (e) {}
    }
    return DEFAULT_PASSWORD;
}

async function verifyToken(token, env) {
    if (!token || !env.VISITOR_KV) return false;
    const session = await env.VISITOR_KV.get(`session_${token}`);
    if (!session) return false;
    try {
        const data = JSON.parse(session);
        if (data.expires < Date.now()) {
            await env.VISITOR_KV.delete(`session_${token}`);
            return false;
        }
        return true;
    } catch (e) {
        return false;
    }
}

export async function onRequest(context) {
    const { request, env } = context;

    try {
        const url = new URL(request.url);

        // GET: 验证 token
        if (request.method === 'GET') {
            const authHeader = request.headers.get('Authorization') || '';
            const token = authHeader.replace('Bearer ', '');
            const isValid = token ? await verifyToken(token, env) : false;
            return new Response(JSON.stringify({ valid: isValid }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // POST
        if (request.method === 'POST') {
            const body = await request.json().catch(() => ({}));

            // action: verify - 前端验证登录状态
            if (body.action === 'verify') {
                const isValid = body.token ? await verifyToken(body.token, env) : false;
                return new Response(JSON.stringify({ valid: isValid }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // action: logout - 退出登录
            if (body.action === 'logout') {
                if (body.token && env.VISITOR_KV) {
                    await env.VISITOR_KV.delete(`session_${body.token}`);
                }
                return new Response(JSON.stringify({ success: true }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // action: change_password - 修改密码
            if (body.action === 'change_password') {
                const token = request.headers.get('Authorization')?.replace('Bearer ', '');
                if (!token || !(await verifyToken(token, env))) {
                    return new Response(JSON.stringify({ success: false, error: '未登录' }), {
                        status: 401,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                if (!body.newPassword || body.newPassword.length < 4) {
                    return new Response(JSON.stringify({ success: false, error: '密码至少4位' }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                if (env.VISITOR_KV) {
                    const existing = await env.VISITOR_KV.get('admin_config');
                    let config = {};
                    if (existing) {
                        try { config = JSON.parse(existing); } catch (e) {}
                    }
                    config.password = body.newPassword;
                    await env.VISITOR_KV.put('admin_config', JSON.stringify(config));
                }
                return new Response(JSON.stringify({ success: true }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // 默认: 登录
            const adminPassword = await getAdminPassword(env);
            if (body.password === adminPassword) {
                const token = generateToken();
                if (env.VISITOR_KV) {
                    // session 有效期 7 天
                    const session = {
                        created: Date.now(),
                        expires: Date.now() + 7 * 24 * 60 * 60 * 1000
                    };
                    await env.VISITOR_KV.put(`session_${token}`, JSON.stringify(session));
                }
                return new Response(JSON.stringify({
                    success: true,
                    token
                }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            return new Response(JSON.stringify({
                success: false,
                error: '密码错误'
            }), {
                status: 401,
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

// 导出 verifyToken 供其他函数使用
export { verifyToken };

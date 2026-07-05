// 统计 API - 记录和返回真实访问数据
export async function onRequest(context) {
    const { request, env } = context;

    try {
        if (!env.VISITOR_KV) {
            return new Response(JSON.stringify({
                success: false,
                error: 'KV未配置',
                dailyVisits: {},
                pageVisits: {},
                recentVisits: []
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // ===== POST: 记录一次访问 =====
        if (request.method === 'POST') {
            const body = await request.json();
            const { page, pageName } = body;

            const today = new Date();
            const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

            // 1. 每日访问统计
            let dailyVisits = {};
            const dailyStored = await env.VISITOR_KV.get('daily_visits');
            if (dailyStored) {
                try { dailyVisits = JSON.parse(dailyStored); } catch (e) {}
            }
            dailyVisits[dateKey] = (dailyVisits[dateKey] || 0) + 1;
            // 只保留最近 30 天
            const keys = Object.keys(dailyVisits).sort();
            if (keys.length > 30) {
                const newDaily = {};
                keys.slice(-30).forEach(k => { newDaily[k] = dailyVisits[k]; });
                dailyVisits = newDaily;
            }
            await env.VISITOR_KV.put('daily_visits', JSON.stringify(dailyVisits));

            // 2. 页面访问统计
            let pageVisits = {};
            const pageStored = await env.VISITOR_KV.get('page_visits');
            if (pageStored) {
                try { pageVisits = JSON.parse(pageStored); } catch (e) {}
            }
            const pageKey = page || '/';
            pageVisits[pageKey] = (pageVisits[pageKey] || 0) + 1;
            await env.VISITOR_KV.put('page_visits', JSON.stringify(pageVisits));

            // 3. 最近访问记录
            let recentVisits = [];
            const recentStored = await env.VISITOR_KV.get('recent_visits');
            if (recentStored) {
                try { recentVisits = JSON.parse(recentStored); } catch (e) {}
            }
            recentVisits.unshift({
                page: pageKey,
                pageName: pageName || pageKey,
                time: today.toISOString()
            });
            if (recentVisits.length > 50) recentVisits = recentVisits.slice(0, 50);
            await env.VISITOR_KV.put('recent_visits', JSON.stringify(recentVisits));

            return new Response(JSON.stringify({ success: true }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // ===== GET: 返回所有统计数据 =====
        if (request.method === 'GET') {
            let dailyVisits = {};
            let pageVisits = {};
            let recentVisits = [];

            const dailyStored = await env.VISITOR_KV.get('daily_visits');
            if (dailyStored) {
                try { dailyVisits = JSON.parse(dailyStored); } catch (e) {}
            }

            const pageStored = await env.VISITOR_KV.get('page_visits');
            if (pageStored) {
                try { pageVisits = JSON.parse(pageStored); } catch (e) {}
            }

            const recentStored = await env.VISITOR_KV.get('recent_visits');
            if (recentStored) {
                try { recentVisits = JSON.parse(recentStored); } catch (e) {}
            }

            // 获取今日访问量
            const today = new Date();
            const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const todayVisits = dailyVisits[dateKey] || 0;

            return new Response(JSON.stringify({
                success: true,
                dailyVisits,
                pageVisits,
                recentVisits,
                todayVisits
            }), {
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store'
                }
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

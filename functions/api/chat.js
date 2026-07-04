// AI 聊天 API - 使用 Cloudflare Workers AI（完全免费）
// 方式一：使用 AI Binding（变量名 AI）
// 方式二：使用 API Token（环境变量 CF_API_TOKEN + CF_ACCOUNT_ID）

export async function onRequest(context) {
    const { request, env } = context;

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    try {
        const body = await request.json();
        const { messages } = body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return new Response(JSON.stringify({ error: '消息不能为空' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        const aiMessages = [
            { role: 'system', content: '你是一个友好的 AI 助手，请用中文回答。回答简洁准确、热情友好。' },
            ...messages.slice(-20).map(m => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content
            }))
        ];

        let reply = null;

        // 方式一：AI Binding
        if (env.AI) {
            try {
                const result = await env.AI.run('@cf/qwen/qwen1.5-14b-chat-awq', {
                    messages: aiMessages,
                    max_tokens: 2048,
                    temperature: 0.7
                });
                reply = result?.response;
            } catch (e) { console.error('Binding error:', e.message); }
        }

        // 方式二：API Token（推荐，不需要找 Binding 设置）
        if (!reply && env.CF_API_TOKEN && env.CF_ACCOUNT_ID) {
            try {
                const res = await fetch(
                    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/@cf/qwen/qwen1.5-14b-chat-awq`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${env.CF_API_TOKEN}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ messages: aiMessages })
                    }
                );
                const data = await res.json();
                reply = data?.result?.response;
            } catch (e) { console.error('API Token error:', e.message); }
        }

        if (reply) {
            return new Response(JSON.stringify({ reply }), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        // 都没配置，显示提示
        return new Response(JSON.stringify({
            reply: `## 🤖 需要配置才能使用 AI\n\n` +
                   `**最简单的配置方法（2 分钟）：**\n\n` +
                   `**步骤 1：** 登录 [Cloudflare](https://dash.cloudflare.com)\n\n` +
                   `**步骤 2：** 左侧菜单 → **My Profile** → **API Tokens**\n\n` +
                   `**步骤 3：** 点 **Create Token** → 找到 **Workers AI** 模板 → 点 **Use template**\n\n` +
                   `**步骤 4：** 点 **Continue to summary** → **Create Token** → **复制 Token**\n\n` +
                   `**步骤 5：** 回到项目 **Settings** → **Environment Variables**\n` +
                   `  添加：\`CF_API_TOKEN\` = 你复制的 Token\n` +
                   `  添加：\`CF_ACCOUNT_ID\` = 你的 Cloudflare 账号 ID\n` +
                   `  （账号 ID 在右侧栏可以找到）\n\n` +
                   `**步骤 6：** **Save and Deploy** 重新部署\n\n` +
                   `搞定后刷新页面就能用了！完全免费 🎉`
        }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });

    } catch (error) {
        return new Response(JSON.stringify({
            reply: `⚠️ 出错了：${error.message}`
        }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }
}

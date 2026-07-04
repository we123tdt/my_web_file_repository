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

        // 方式二：API Token
        if (!reply && env.CF_API_TOKEN && env.CF_ACCOUNT_ID) {
            try {
                const tokenPreview = env.CF_API_TOKEN.substring(0, 8) + '...';
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

                if (data?.result?.response) {
                    reply = data.result.response;
                } else if (data?.errors) {
                    const errMsg = data.errors[0]?.message || JSON.stringify(data.errors);
                    return new Response(JSON.stringify({
                        reply: `❌ **API 调用失败**\n\n` +
                               `错误：${errMsg}\n\n` +
                               `可能原因：创建的 Token 没有 Workers AI 权限。\n` +
                               `请重新创建 Token，选择 **Workers AI** 模板。`
                    }), {
                        headers: { 'Content-Type': 'application/json', ...corsHeaders }
                    });
                }
            } catch (e) {
                return new Response(JSON.stringify({
                    reply: `❌ **API 请求出错**\n\n` +
                           `错误：${e.message}\n\n` +
                           `请检查环境变量是否正确设置并重新部署。`
                }), {
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }
        }

        if (reply) {
            return new Response(JSON.stringify({ reply }), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        // 检查哪些环境变量缺失
        const missing = [];
        if (!env.CF_API_TOKEN) missing.push('`CF_API_TOKEN`');
        if (!env.CF_ACCOUNT_ID) missing.push('`CF_ACCOUNT_ID`');

        return new Response(JSON.stringify({
            reply: `## 🤖 环境变量未生效\n\n` +
                   (missing.length > 0
                       ? `**缺失的变量：** ${missing.join(', ')}\n\n`
                       : '环境变量已设置但未能调用 AI，可能是 Token 权限问题。\n\n') +
                   `**请检查：**\n\n` +
                   `1️⃣ 是否已添加这两个环境变量？\n` +
                   `   - \`CF_API_TOKEN\` = 你的 Token\n` +
                   `   - \`CF_ACCOUNT_ID\` = d44f3f7811ae2438d6809ee52b64b77b\n\n` +
                   `2️⃣ **关键：添加后要点 "Save and Deploy" 重新部署！**\n` +
                   `   只点 Save 不会生效。\n\n` +
                   `3️⃣ 部署完成（约1分钟）后刷新此页面。`
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

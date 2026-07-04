// AI 聊天 API - 使用 DeepSeek API
// 需要在 Cloudflare Pages 环境变量中设置 DEEPSEEK_API_KEY
// 获取免费 API Key: https://platform.deepseek.com

export async function onRequest(context) {
    const { request, env } = context;

    // 允许跨域
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

        // 获取 API Key - 支持多种环境变量名称
        const apiKey = env.DEEPSEEK_API_KEY || env.DEEPSEEK_KEY || env.DEEPSEEK_APIKEY;

        // 调试信息：检查环境变量是否存在（不暴露具体值）
        const keyExists = !!apiKey;
        const keyPrefix = apiKey ? apiKey.substring(0, 5) + '...' : '未设置';

        if (!apiKey) {
            return new Response(JSON.stringify({
                reply: `⚠️ **环境变量 DEEPSEEK_API_KEY 未检测到**\n\n` +
                       `你需要在 Cloudflare 后台设置环境变量。\n\n` +
                       `**操作步骤：**\n` +
                       `1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)\n` +
                       `2. 进入 **Workers & Pages** → 你的项目\n` +
                       `3. 点击 **Settings** → **Environment Variables**\n` +
                       `4. 点击 **Add variable**\n` +
                       `5. 名称填：\`DEEPSEEK_API_KEY\`\n` +
                       `6. 值填：你的 DeepSeek API Key（以 sk- 开头）\n` +
                       `7. 点击 **Save and Deploy** 重新部署\n\n` +
                       `💡 免费获取 API Key：[platform.deepseek.com](https://platform.deepseek.com)`
            }), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        // 调用 DeepSeek API
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: '你是一个友好的 AI 助手。请用中文回答问题，回答要简洁准确。'
                    },
                    ...messages.slice(-20)
                ],
                max_tokens: 2048,
                temperature: 0.7,
                stream: false
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMsg = '';
            
            if (response.status === 401) {
                errorMsg = `❌ **API Key 无效**（HTTP 401）\n\n` +
                           `你设置的 API Key 不正确，请检查：\n` +
                           `1. 当前 Key 前缀：\`${keyPrefix}\`\n` +
                           `2. 确认 Key 以 \`sk-\` 开头\n` +
                           `3. 去 [platform.deepseek.com](https://platform.deepseek.com) 重新创建\n` +
                           `4. 在 Cloudflare 更新后重新部署`;
            } else if (response.status === 402) {
                errorMsg = `❌ **账户余额不足**（HTTP 402）\n\n` +
                           `你的 DeepSeek 账户需要充值。\n` +
                           `不过别担心，新用户有 500 万免费 tokens！\n` +
                           `去 [platform.deepseek.com](https://platform.deepseek.com) 查看。`;
            } else if (response.status === 429) {
                errorMsg = `⏳ **请求太频繁**（HTTP 429）\n\n` +
                           `请稍等几秒再试。`;
            } else if (response.status >= 500) {
                errorMsg = `🔧 **DeepSeek 服务器繁忙**（HTTP ${response.status}）\n\n` +
                           `请稍后再试。`;
            } else {
                errorMsg = `⚠️ **API 请求失败**（HTTP ${response.status}）\n\n` +
                           `错误详情：\`${errorText.substring(0, 200)}\``;
            }

            return new Response(JSON.stringify({ reply: errorMsg }), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content;

        if (!reply) {
            return new Response(JSON.stringify({
                reply: '⚠️ AI 返回了空回复，请重试。'
            }), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        return new Response(JSON.stringify({ reply }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });

    } catch (error) {
        return new Response(JSON.stringify({
            reply: `⚠️ **服务器内部错误**\n\n` +
                   `错误信息：\`${error.message}\`\n\n` +
                   `请检查：\n` +
                   `1. Cloudflare 环境变量是否已设置 \`DEEPSEEK_API_KEY\`\n` +
                   `2. 设置后是否点击了 **Save and Deploy** 重新部署\n` +
                   `3. 如果已设置，检查 Key 是否正确`
        }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }
}

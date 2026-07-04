// AI 聊天 API - 使用 DeepSeek API
// 需要在 Cloudflare Pages 环境变量中设置 DEEPSEEK_API_KEY

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const body = await request.json();
        const { messages, stream } = body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return new Response(JSON.stringify({ error: '消息不能为空' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const apiKey = env.DEEPSEEK_API_KEY;

        if (!apiKey) {
            // 如果没有配置 API Key，返回模拟回复
            return handleFallback(messages);
        }

        // 调用 DeepSeek API
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
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
                    ...messages.slice(-20) // 限制上下文长度
                ],
                max_tokens: 2048,
                temperature: 0.7,
                stream: false
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('DeepSeek API error:', response.status, errorText);

            if (response.status === 401) {
                return new Response(JSON.stringify({
                    error: 'API Key 无效，请在 Cloudflare 环境变量中设置正确的 DEEPSEEK_API_KEY'
                }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            return handleFallback(messages);
        }

        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content;

        if (!reply) {
            return handleFallback(messages);
        }

        return new Response(JSON.stringify({ reply }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Chat API error:', error.message);
        // 尝试返回模拟回复
        try {
            const body = await request.clone().json();
            return handleFallback(body.messages);
        } catch (e) {
            return new Response(JSON.stringify({
                error: '服务器出错，请稍后重试',
                reply: '抱歉，我现在无法回答。请稍后再试。'
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
}

// 当 API Key 未配置或 API 调用失败时的备用回复
function handleFallback(messages) {
    const userMessage = messages[messages.length - 1]?.content || '';
    const lowerMsg = userMessage.toLowerCase();

    let reply = '';

    if (lowerMsg.includes('你好') || lowerMsg.includes('hello') || lowerMsg.includes('hi')) {
        reply = '你好！我是 AI 助手。有什么我可以帮你的吗？\n\n（提示：你可以在 Cloudflare 环境变量中设置 DEEPSEEK_API_KEY 来启用真正的 AI 对话能力）';
    } else if (lowerMsg.includes('名字') || lowerMsg.includes('who are you')) {
        reply = '我是 AP 工作室的 AI 助手，基于 DeepSeek 模型。请设置 DEEPSEEK_API_KEY 来启用完整的对话功能。';
    } else if (lowerMsg.includes('天气')) {
        reply = '查看天气请访问首页的"天气"页面，那里有实时天气预报功能。';
    } else if (lowerMsg.includes('时间') || lowerMsg.includes('几点了')) {
        const now = new Date();
        reply = `现在是 ${now.toLocaleString('zh-CN')}`;
    } else if (lowerMsg.includes('功能') || lowerMsg.includes('什么')) {
        reply = '这个网站有以下功能：\n' +
            '- 🔗 网址导航\n' +
            '- 📸 图片画廊\n' +
            '- 🎮 小游戏（2048、猜数字、扫雷）\n' +
            '- 🤖 AI 聊天（需要配置 API Key）\n' +
            '- ⏰ 时光机（时钟、倒计时、秒表）\n' +
            '- 🌤️ 天气预报\n' +
            '- 💬 留言板\n' +
            '- 📊 访问统计\n\n' +
            '设置 DEEPSEEK_API_KEY 后 AI 将拥有真正的对话能力！';
    } else {
        reply = '我收到了你的消息：「' + userMessage + '」\n\n' +
            '⚠️ 当前 AI 尚未配置 API Key，只能回复预设消息。\n\n' +
            '要启用完整 AI 对话功能，请在 Cloudflare 环境变量中设置：\n' +
            '`DEEPSEEK_API_KEY` = 你的 DeepSeek API Key\n\n' +
            '你可以访问 [platform.deepseek.com](https://platform.deepseek.com) 获取免费的 API Key。';
    }

    return new Response(JSON.stringify({ reply }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
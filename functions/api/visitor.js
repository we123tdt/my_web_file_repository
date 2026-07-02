export async function onRequest(context) {
    const { env } = context;
    
    try {
        if (!env.VISITOR_KV) {
            const count = parseInt(localStorage.getItem('visitor_count') || '0');
            return new Response(JSON.stringify({ count }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        const currentCount = parseInt(await env.VISITOR_KV.get('visitor_count') || '0');
        const newCount = currentCount + 1;
        await env.VISITOR_KV.put('visitor_count', newCount.toString());
        
        return new Response(JSON.stringify({ count: newCount }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        const count = parseInt(localStorage.getItem('visitor_count') || '0');
        return new Response(JSON.stringify({ count }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
export async function onRequest(context) {
    const { env, request } = context;
    
    if (!env.VISITOR_KV) {
        return new Response(JSON.stringify({ error: 'KV namespace not bound' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    
    if (action === 'get') {
        const filesStr = await env.VISITOR_KV.get('download_files');
        return new Response(filesStr || '[]', {
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    if (action === 'add') {
        const fileName = url.searchParams.get('name');
        if (!fileName) {
            return new Response(JSON.stringify({ error: 'File name required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        const filesStr = await env.VISITOR_KV.get('download_files');
        const files = filesStr ? JSON.parse(filesStr) : [];
        
        if (!files.find(f => f.name === fileName)) {
            files.push({ name: fileName });
            await env.VISITOR_KV.put('download_files', JSON.stringify(files));
        }
        
        return new Response(JSON.stringify({ success: true, files }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    if (action === 'remove') {
        const fileName = url.searchParams.get('name');
        if (!fileName) {
            return new Response(JSON.stringify({ error: 'File name required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        const filesStr = await env.VISITOR_KV.get('download_files');
        const files = filesStr ? JSON.parse(filesStr) : [];
        
        const filtered = files.filter(f => f.name !== fileName);
        await env.VISITOR_KV.put('download_files', JSON.stringify(filtered));
        
        return new Response(JSON.stringify({ success: true, files: filtered }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
    });
}
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
        await env.VISITOR_KV.delete(`file_content:${fileName}`);
        
        return new Response(JSON.stringify({ success: true, files: filtered }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (action === 'get_content') {
        const fileName = url.searchParams.get('name');
        if (!fileName) {
            return new Response(JSON.stringify({ error: 'File name required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const content = await env.VISITOR_KV.get(`file_content:${fileName}`);
        return new Response(JSON.stringify({ success: true, content: content || '' }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (action === 'set_content') {
        if (request.method !== 'POST') {
            return new Response(JSON.stringify({ error: 'Method not allowed' }), {
                status: 405,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const body = await request.json();
        const fileName = body.name;
        const content = body.content;

        if (!fileName) {
            return new Response(JSON.stringify({ error: 'File name required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (content === undefined) {
            return new Response(JSON.stringify({ error: 'Content required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        await env.VISITOR_KV.put(`file_content:${fileName}`, content);
        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
    });
}
export async function onRequest(context) {
    const { env } = context;
    
    try {
        let files = [];
        
        if (env.VISITOR_KV) {
            const filesStr = await env.VISITOR_KV.get('download_files');
            if (filesStr) {
                try {
                    const kvFiles = JSON.parse(filesStr);
                    if (Array.isArray(kvFiles) && kvFiles.length > 0) {
                        files = kvFiles;
                    }
                } catch (e) {}
            }
        }
        
        if (files.length === 0) {
            const defaultFilesResponse = await env.ASSETS.fetch('/files/files.json');
            if (defaultFilesResponse.ok) {
                try {
                    const defaultFiles = await defaultFilesResponse.json();
                    if (Array.isArray(defaultFiles) && defaultFiles.length > 0) {
                        files = defaultFiles;
                    }
                } catch (e) {}
            }
        }
        
        if (files.length === 0) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: 'No files configured',
                fallbackUrl: '/files/web.zip'
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        files.sort((a, b) => {
            const getName = (item) => typeof item === 'string' ? item : (item.name || '');
            const getVersion = (name) => {
                const dateTimeMatch = name.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
                if (dateTimeMatch) return parseInt(dateTimeMatch[1] + dateTimeMatch[2] + dateTimeMatch[3] + dateTimeMatch[4] + dateTimeMatch[5]);
                const dateMatch = name.match(/(\d{4})(\d{2})(\d{2})/);
                if (dateMatch) return parseInt(dateMatch[1] + dateMatch[2] + dateMatch[3]);
                const versionMatch = name.match(/v(\d+)/);
                if (versionMatch) return parseInt(versionMatch[1]) * 100000000;
                return 0;
            };
            return getVersion(getName(b)) - getVersion(getName(a));
        });
        
        const latest = files[0];
        const latestName = typeof latest === 'string' ? latest : (latest.name || '');
        
        return new Response(JSON.stringify({
            success: true,
            files: files,
            latest: {
                name: latestName,
                url: `/files/${latestName}`
            }
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ 
            success: false,
            error: error.message,
            fallbackUrl: '/files/web.zip'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
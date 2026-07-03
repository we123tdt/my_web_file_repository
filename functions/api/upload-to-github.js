export async function onRequest(context) {
    const { request, env } = context;

    // 配置
    const GITHUB_TOKEN = env.GITHUB_TOKEN;
    const GITHUB_USER = 'we123tdt';
    const GITHUB_REPO = 'web-download-files';
    const BRANCH = 'main';
    const CDN_BASE_URL = `https://cdn.jsdelivr.net/gh/${GITHUB_USER}/${GITHUB_REPO}`;
    const MAX_SIZE = 100 * 1024 * 1024; // 100MB（Contents API 限制）

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({
            success: false,
            error: '仅支持 POST 请求'
        }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (!GITHUB_TOKEN) {
        return new Response(JSON.stringify({
            success: false,
            error: '服务器未配置 GitHub Token，请在 Cloudflare Pages 环境变量中设置 GITHUB_TOKEN'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const contentType = request.headers.get('Content-Type') || '';

    try {
        // ========== JSON 请求：prepare / record 模式 ==========
        if (contentType.includes('application/json')) {
            const body = await request.json();

            // prepare：检查文件大小，决定上传方式
            if (body.action === 'prepare') {
                const { name, size } = body;

                if (!name || size === undefined) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: '缺少文件名或文件大小'
                    }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                if (size < MAX_SIZE) {
                    // 小文件：后端代理上传到 Contents API（jsDelivr CDN 可访问）
                    return new Response(JSON.stringify({
                        success: true,
                        mode: 'proxy'
                    }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                } else {
                    // 大文件：创建 Release，前端直接上传到 GitHub Releases
                    const tag = `upload-${Date.now()}`;

                    const releaseResponse = await fetch(
                        `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/releases`,
                        {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                                'Accept': 'application/vnd.github+json',
                                'User-Agent': 'Cloudflare-Pages',
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                tag_name: tag,
                                name: name,
                                body: `上传文件 ${name} (${(size / 1024 / 1024).toFixed(1)} MB)`,
                                draft: false,
                                prerelease: false
                            })
                        }
                    );

                    if (!releaseResponse.ok) {
                        const err = await releaseResponse.json();
                        return new Response(JSON.stringify({
                            success: false,
                            error: '创建 Release 失败: ' + (err.message || '')
                        }), {
                            status: releaseResponse.status,
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }

                    const release = await releaseResponse.json();
                    const downloadUrl = `https://github.com/${GITHUB_USER}/${GITHUB_REPO}/releases/download/${tag}/${encodeURIComponent(name)}`;
                    const downloadUrlFast = `https://gh-proxy.org/${downloadUrl}`;

                    return new Response(JSON.stringify({
                        success: true,
                        mode: 'release',
                        uploadUrl: `https://uploads.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
                        token: GITHUB_TOKEN,
                        downloadUrl: downloadUrlFast,
                        tag: tag
                    }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
            }

            // record：大文件上传完成后，更新 KV 记录
            if (body.action === 'record') {
                const { name, url } = body;

                if (!name || !url) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: '缺少文件名或下载地址'
                    }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                await updateKVFileRecord(env, name, url);

                return new Response(JSON.stringify({
                    success: true,
                    message: '文件记录已更新'
                }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // ========== 小文件代理上传：octet-stream ==========
        if (contentType.includes('application/octet-stream')) {
            const fileName = request.headers.get('X-File-Name');
            const fileSize = parseInt(request.headers.get('X-File-Size') || '0');

            if (!fileName) {
                return new Response(JSON.stringify({
                    success: false,
                    error: '缺少文件名'
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            if (fileSize >= MAX_SIZE) {
                return new Response(JSON.stringify({
                    success: false,
                    error: '文件超过 100MB，请使用 Release 模式上传'
                }), {
                    status: 413,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // 读取文件并转 base64
            const arrayBuffer = await request.arrayBuffer();
            const base64Content = arrayBufferToBase64(arrayBuffer);

            // 上传到 GitHub Contents API
            const githubApiUrl = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${encodeURIComponent(fileName)}`;

            // 检查文件是否已存在（获取 sha 用于覆盖）
            let fileSha = null;
            const checkResponse = await fetch(githubApiUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github+json',
                    'User-Agent': 'Cloudflare-Pages'
                }
            });

            if (checkResponse.ok) {
                const existingFile = await checkResponse.json();
                fileSha = existingFile.sha;
            }

            const uploadBody = {
                message: `上传文件 ${fileName}`,
                content: base64Content,
                branch: BRANCH
            };
            if (fileSha) {
                uploadBody.sha = fileSha;
            }

            const uploadResponse = await fetch(githubApiUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github+json',
                    'User-Agent': 'Cloudflare-Pages',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(uploadBody)
            });

            const result = await uploadResponse.json();

            if (uploadResponse.ok) {
                // 更新 KV 记录（包含 jsDelivr CDN URL）
                const downloadUrl = `${CDN_BASE_URL}/${encodeURIComponent(fileName)}`;
                await updateKVFileRecord(env, fileName, downloadUrl);

                return new Response(JSON.stringify({
                    success: true,
                    message: '文件上传成功',
                    downloadUrl: downloadUrl
                }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } else {
                return new Response(JSON.stringify({
                    success: false,
                    error: result.message || 'GitHub API 上传失败'
                }), {
                    status: uploadResponse.status,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        return new Response(JSON.stringify({
            success: false,
            error: '不支持的请求类型'
        }), {
            status: 400,
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

// ArrayBuffer 转 base64（避免 spread 操作符的参数数量限制）
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// 更新 KV 中的文件记录（存储 name + url）
async function updateKVFileRecord(env, fileName, downloadUrl) {
    if (!env.VISITOR_KV) return;

    const filesStr = await env.VISITOR_KV.get('download_files');
    let files = [];
    if (filesStr) {
        try {
            files = JSON.parse(filesStr);
        } catch (e) {}
    }

    // 检查是否已存在，存在则更新 url
    const existingIndex = files.findIndex(f =>
        (typeof f === 'string' ? f : f.name) === fileName
    );

    if (existingIndex >= 0) {
        files[existingIndex] = { name: fileName, url: downloadUrl };
    } else {
        files.push({ name: fileName, url: downloadUrl });
    }

    await env.VISITOR_KV.put('download_files', JSON.stringify(files));
}

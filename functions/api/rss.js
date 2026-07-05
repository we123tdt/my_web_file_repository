// RSS 热点聚合 - 抓取多个 RSS 源并返回 JSON
const FEEDS = [
    { name: 'Hacker News', url: 'https://hnrss.org/frontpage?count=8', color: '#ff6600' },
    { name: 'V2EX 热门', url: 'https://www.v2ex.com/feed/tab/hot.xml', color: '#a78bfa' },
    { name: '少数派', url: 'https://sspai.com/feed', color: '#d73a49' },
    { name: 'GitHub Trending', url: 'https://mshibanami.github.io/GitHubTrendingRSS/daily/all.xml', color: '#2b3137' },
];

async function fetchFeed(feed) {
    try {
        const res = await fetch(feed.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AP-Studio/1.0)' },
            cf: { cacheTtl: 300 } // 缓存5分钟
        });
        if (!res.ok) return null;
        const xml = await res.text();
        return parseRSS(xml, feed);
    } catch (e) {
        return null;
    }
}

function parseRSS(xml, feed) {
    const items = [];
    // 匹配 <item> 或 <entry> 标签
    const itemRegex = /<(item|entry)>([\s\S]*?)<\/(item|entry)>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
        const content = match[2];
        const title = extractTag(content, 'title');
        const link = extractTag(content, 'link') || extractLinkHref(content);
        // Atom feed uses <published> or <updated>, RSS uses <pubDate>
        const pubDate = extractTag(content, 'pubDate') || extractTag(content, 'published') || extractTag(content, 'updated');
        const description = stripHtml(extractTag(content, 'description') || extractTag(content, 'summary') || '');
        const sourceName = extractTag(content, 'source') || '';

        if (title && link) {
            items.push({
                title: decodeEntities(title),
                link: link.trim(),
                source: feed.name,
                sourceColor: feed.color,
                pubDate: pubDate ? new Date(pubDate).toISOString() : null,
                description: decodeEntities(description).slice(0, 120),
            });
        }
    }
    return items.slice(0, 8);
}

function extractTag(content, tag) {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = content.match(regex);
    if (match) return match[1].trim();
    // 处理 CDATA
    const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
    const cdataMatch = content.match(cdataRegex);
    return cdataMatch ? cdataMatch[1].trim() : '';
}

function extractLinkHref(content) {
    const match = content.match(/<link[^>]*href="([^"]*)"[^>]*\/?>/i);
    return match ? match[1] : '';
}

function stripHtml(str) {
    return str.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
}

function decodeEntities(str) {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
        .trim();
}

export async function onRequest(context) {
    const { request, env } = context;

    try {
        // 并发抓取所有 RSS 源
        const results = await Promise.all(FEEDS.map(fetchFeed));

        // 合并、排序（有日期的按日期排，无日期的排最前）
        const allItems = [];
        results.forEach((items, idx) => {
            if (items && items.length) {
                allItems.push(...items);
            }
        });

        // 按发布时间排序
        allItems.sort((a, b) => {
            if (a.pubDate && b.pubDate) return new Date(b.pubDate) - new Date(a.pubDate);
            if (a.pubDate) return -1;
            if (b.pubDate) return 1;
            return 0;
        });

        return new Response(JSON.stringify({
            success: true,
            items: allItems.slice(0, 20),
            sources: FEEDS.map(f => ({ name: f.name, color: f.color })),
            updated: new Date().toISOString()
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=300'
            }
        });

    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            error: error.message,
            items: []
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

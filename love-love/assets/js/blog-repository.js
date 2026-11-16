// Shared Supabase mapping for the public journal and the admin editor.
window.LEGACY_BLOG_PAGES = {
    'box-braids-guide-complet': 'box-braids.html',
    'cornrows-ou-box-braids': 'cornrows-ou-box-braids.html',
    'entretien-tresses-routine': 'entretien-tresses.html',
    'tendances-tresses-2026': 'tendances-tresses-2026.html'
};

window.getBlogImageUrl = function (value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
        const url = new URL(value, window.location.href);
        const supabaseOrigin = new URL(SUPABASE_URL).origin;
        if (url.origin !== window.location.origin && url.origin !== supabaseOrigin) return '';
        return url.href;
    } catch (error) {
        return '';
    }
};

window.getBlogSourceUrl = function (value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
        const url = new URL(value);
        return url.protocol === 'https:' ? url.href : '';
    } catch (error) {
        return '';
    }
};

window.normalizeBlogPost = function (row) {
    const publishedAt = row.published_at || row.created_at || new Date().toISOString();
    return {
        id: row.id,
        slug: row.slug,
        page: window.LEGACY_BLOG_PAGES[row.slug] || '',
        title: row.title,
        category: row.category || 'Conseils',
        date: publishedAt.slice(0, 10),
        readTime: Math.max(1, Number(row.read_time) || 5) + ' min',
        image: window.getBlogImageUrl(row.image_url),
        imageAlt: row.image_alt || row.title,
        imageCredit: row.image_credit || '',
        imageSource: window.getBlogSourceUrl(row.image_source),
        excerpt: row.excerpt || '',
        content: row.content || ''
    };
};

window.fetchPublishedBlogPosts = async function () {
    const { data, error } = await window.supabaseClient
        .from('posts')
        .select('id,title,slug,status,created_at,category,excerpt,image_url,image_alt,image_credit,image_source,read_time,published_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false, nullsFirst: false });

    return {
        posts: error ? [] : (data || []).map(window.normalizeBlogPost),
        error: error
    };
};

window.fetchPublishedBlogPost = async function (slug) {
    const { data, error } = await window.supabaseClient
        .from('posts')
        .select('id,title,slug,content,status,created_at,category,excerpt,image_url,image_alt,image_credit,image_source,read_time,published_at')
        .eq('status', 'published')
        .eq('slug', slug)
        .maybeSingle();

    return {
        post: error || !data ? null : window.normalizeBlogPost(data),
        error: error
    };
};

window.sanitizeBlogHtml = function (html) {
    const allowedTags = new Set([
        'P', 'H2', 'H3', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'B', 'I',
        'BLOCKQUOTE', 'BR', 'A', 'HR'
    ]);
    const parsed = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const output = document.createElement('div');

    function copyNode(node, parent) {
        if (node.nodeType === Node.TEXT_NODE) {
            parent.append(document.createTextNode(node.nodeValue || ''));
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const tag = node.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME' || tag === 'OBJECT') return;
        if (!allowedTags.has(tag)) {
            Array.from(node.childNodes).forEach(function (child) {
                copyNode(child, parent);
            });
            return;
        }

        const clean = document.createElement(tag.toLowerCase());
        if (tag === 'A') {
            const href = node.getAttribute('href') || '';
            try {
                const url = new URL(href, window.location.href);
                if (['http:', 'https:', 'mailto:'].includes(url.protocol)) {
                    clean.href = url.href;
                    if (url.origin !== window.location.origin && url.protocol !== 'mailto:') {
                        clean.target = '_blank';
                        clean.rel = 'noopener noreferrer';
                    }
                }
            } catch (error) {
                // Invalid links are kept as plain text.
            }
        }
        if (tag !== 'BR' && tag !== 'HR') {
            Array.from(node.childNodes).forEach(function (child) {
                copyNode(child, clean);
            });
        }
        parent.append(clean);
    }

    Array.from(parsed.body.childNodes).forEach(function (node) {
        copyNode(node, output);
    });
    return output.innerHTML;
};

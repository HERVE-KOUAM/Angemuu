document.addEventListener('DOMContentLoaded', function () {
    const featuredRoot = document.getElementById('featured-post');
    const listRoot = document.getElementById('post-list');
    const filterRoot = document.getElementById('post-filters');
    const searchInput = document.getElementById('post-search');
    const count = document.getElementById('post-count');
    const emptyState = document.getElementById('empty-state');
    const status = document.getElementById('blog-load-status');

    if (!featuredRoot || !listRoot || !filterRoot || !searchInput || !count || !emptyState) return;

    let posts = [];
    let activeCategory = 'Tout';

    function articleUrl(post) {
        return post.page || 'blog-single.html?slug=' + encodeURIComponent(post.slug);
    }

    function formatDate(date) {
        return new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }

    function createImage(post, className) {
        if (!post.image) return null;
        const image = document.createElement('img');
        image.className = className;
        image.src = post.image;
        image.alt = post.imageAlt || post.title;
        image.loading = 'lazy';
        image.decoding = 'async';
        return image;
    }

    function createStory(post) {
        const card = document.createElement('article');
        card.className = 'story-card';

        const link = document.createElement('a');
        link.className = 'story-card-link';
        link.href = articleUrl(post);
        link.setAttribute('aria-label', 'Lire : ' + post.title);

        const image = createImage(post, 'story-image');
        if (image) {
            const imageWrap = document.createElement('span');
            imageWrap.className = 'story-image-wrap';
            imageWrap.append(image);
            link.append(imageWrap);
        }

        const meta = document.createElement('p');
        meta.className = 'post-meta story-meta';
        const category = document.createElement('span');
        category.className = 'category';
        category.textContent = post.category;
        meta.append(category, document.createTextNode('  ·  ' + formatDate(post.date)));

        const title = document.createElement('h3');
        title.className = 'story-title';
        title.textContent = post.title;

        const excerpt = document.createElement('p');
        excerpt.className = 'story-excerpt';
        excerpt.textContent = post.excerpt;

        const footer = document.createElement('span');
        footer.className = 'story-footer';
        const duration = document.createElement('span');
        duration.textContent = post.readTime + ' de lecture';
        const read = document.createElement('span');
        read.className = 'read-link';
        read.textContent = 'Lire l’article';
        footer.append(duration, read);

        link.append(meta, title, excerpt, footer);
        card.append(link);
        return card;
    }

    function renderFeatured(post) {
        featuredRoot.replaceChildren();
        if (!post) return;

        const article = document.createElement('article');
        article.className = 'featured-article';

        const copy = document.createElement('div');
        copy.className = 'feature-copy';

        const meta = document.createElement('p');
        meta.className = 'post-meta';
        const category = document.createElement('span');
        category.className = 'category';
        category.textContent = post.category;
        meta.append(category, document.createTextNode('  ·  ' + formatDate(post.date)));

        const title = document.createElement('h2');
        title.className = 'feature-title';
        const titleLink = document.createElement('a');
        titleLink.href = articleUrl(post);
        titleLink.textContent = post.title;
        title.append(titleLink);

        const excerpt = document.createElement('p');
        excerpt.className = 'post-excerpt';
        excerpt.textContent = post.excerpt;

        const read = document.createElement('a');
        read.className = 'read-link';
        read.href = articleUrl(post);
        read.textContent = 'Découvrir l’article';

        const visual = document.createElement('a');
        visual.className = 'feature-visual';
        visual.href = articleUrl(post);
        visual.setAttribute('aria-label', 'Découvrir : ' + post.title);
        const image = createImage(post, '');
        if (image) {
            image.loading = 'eager';
            image.fetchPriority = 'high';
            visual.append(image);
        }

        copy.append(meta, title, excerpt, read);
        article.append(copy);
        if (image) article.append(visual);
        featuredRoot.replaceChildren(article);
    }

    function renderFilters() {
        const categories = Array.from(new Set(posts.map(function (post) {
            return post.category;
        })));
        const labels = ['Tout'].concat(categories);
        filterRoot.replaceChildren();

        labels.forEach(function (category) {
            const button = document.createElement('button');
            button.className = 'filter-button';
            button.type = 'button';
            button.textContent = category;
            button.setAttribute('aria-pressed', String(category === activeCategory));
            button.addEventListener('click', function () {
                activeCategory = category;
                renderFilters();
                renderList();
            });
            filterRoot.append(button);
        });
    }

    function renderList() {
        const query = searchInput.value.trim().toLocaleLowerCase('fr');
        const showFeatured = activeCategory === 'Tout' && query.length === 0;
        const visiblePosts = (showFeatured ? posts.slice(1) : posts).filter(function (post) {
            const matchesCategory = activeCategory === 'Tout' || post.category === activeCategory;
            const searchableText = [post.title, post.category, post.excerpt].join(' ').toLocaleLowerCase('fr');
            return matchesCategory && (!query || searchableText.includes(query));
        });

        featuredRoot.hidden = !showFeatured || posts.length === 0;
        count.textContent = visiblePosts.length + (visiblePosts.length > 1 ? ' articles' : ' article');
        emptyState.textContent = posts.length
            ? 'Aucun article ne correspond à cette recherche. Essayez un autre mot ou un autre thème.'
            : 'Aucun article publié pour le moment.';
        emptyState.hidden = visiblePosts.length > 0;
        listRoot.replaceChildren.apply(listRoot, visiblePosts.map(createStory));
    }

    async function loadPosts() {
        status.textContent = 'Chargement des articles…';
        const result = await window.fetchPublishedBlogPosts();
        if (result.error) {
            status.replaceChildren(document.createTextNode('Le journal est temporairement indisponible. '));
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.className = 'read-link';
            retry.textContent = 'Réessayer';
            retry.addEventListener('click', loadPosts);
            status.append(retry);
            return;
        }

        posts = result.posts;
        status.textContent = '';
        renderFeatured(posts[0]);
        renderFilters();
        renderList();
    }

    searchInput.addEventListener('input', renderList);
    loadPosts();
});

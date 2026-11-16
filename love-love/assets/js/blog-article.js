document.addEventListener('DOMContentLoaded', async function () {
    const root = document.getElementById('article-root') || document.querySelector('.article-layout');
    if (!root) return;

    function formatDate(date) {
        return new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }

    function articleUrl(post) {
        return post.page || 'blog-single.html?slug=' + encodeURIComponent(post.slug);
    }

    function createRelatedCard(post) {
        const card = document.createElement('article');
        card.className = 'story-card';
        const link = document.createElement('a');
        link.className = 'story-card-link';
        link.href = articleUrl(post);

        if (post.image) {
            const imageWrap = document.createElement('span');
            imageWrap.className = 'story-image-wrap';
            const image = document.createElement('img');
            image.className = 'story-image';
            image.src = post.image;
            image.alt = post.imageAlt || post.title;
            image.loading = 'lazy';
            image.decoding = 'async';
            imageWrap.append(image);
            link.append(imageWrap);
        }

        const meta = document.createElement('p');
        meta.className = 'post-meta story-meta';
        meta.textContent = post.category + ' · ' + formatDate(post.date);
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

    function setMetadata(post) {
        const canonical = window.location.origin + '/' + articleUrl(post);
        document.title = post.title + ' — Le Journal d’Ange Muu';
        let robots = document.querySelector('meta[name="robots"]');
        if (!robots) {
            robots = document.createElement('meta');
            robots.name = 'robots';
            document.head.append(robots);
        }
        robots.content = 'index,follow';
        const description = document.querySelector('meta[name="description"]');
        if (description) description.content = post.excerpt;

        let canonicalLink = document.querySelector('link[rel="canonical"]');
        if (!canonicalLink) {
            canonicalLink = document.createElement('link');
            canonicalLink.rel = 'canonical';
            document.head.append(canonicalLink);
        }
        canonicalLink.href = canonical;

        [
            ['meta[property="og:title"]', post.title],
            ['meta[property="og:description"]', post.excerpt],
            ['meta[property="og:url"]', canonical],
            ['meta[property="og:image"]', post.image],
            ['meta[name="twitter:title"]', post.title],
            ['meta[name="twitter:description"]', post.excerpt],
            ['meta[name="twitter:image"]', post.image]
        ].forEach(function (entry) {
            const element = document.querySelector(entry[0]);
            if (element) element.content = entry[1];
        });
    }

    function renderArticle(post, allPosts) {
        const breadcrumbs = document.createElement('nav');
        breadcrumbs.className = 'article-breadcrumbs';
        breadcrumbs.setAttribute('aria-label', 'Fil d’Ariane');
        const home = document.createElement('a');
        home.href = 'index.html';
        home.textContent = 'Accueil';
        const journal = document.createElement('a');
        journal.href = 'blog.html';
        journal.textContent = 'Le journal';
        breadcrumbs.append(home, document.createTextNode('  /  '), journal, document.createTextNode('  /  ' + post.category));

        const heading = document.createElement('header');
        heading.className = 'article-heading';
        const title = document.createElement('h1');
        title.className = 'article-title';
        title.textContent = post.title;
        const kicker = document.createElement('p');
        kicker.className = 'article-kicker';
        kicker.textContent = post.category + ' · ' + formatDate(post.date) + ' · ' + post.readTime + ' de lecture';
        const dek = document.createElement('p');
        dek.className = 'article-dek';
        dek.textContent = post.excerpt;
        heading.append(title, kicker, dek);

        const children = [breadcrumbs, heading];
        if (post.image) {
            const figure = document.createElement('figure');
            figure.className = 'article-cover';
            const image = document.createElement('img');
            image.className = 'article-hero';
            image.src = post.image;
            image.alt = post.imageAlt || post.title;
            image.fetchPriority = 'high';
            figure.append(image);
            if (post.imageCredit && post.imageSource) {
                const caption = document.createElement('figcaption');
                caption.className = 'article-caption';
                caption.append(document.createTextNode('Photo : '));
                const credit = document.createElement('a');
                credit.href = post.imageSource;
                credit.target = '_blank';
                credit.rel = 'noopener noreferrer';
                credit.textContent = post.imageCredit;
                caption.append(credit);
                figure.append(caption);
            }
            children.push(figure);
        }

        const content = document.createElement('article');
        content.className = 'article-content blog-content';
        content.innerHTML = window.sanitizeBlogHtml(post.content);
        const backLink = document.createElement('a');
        backLink.className = 'back-link';
        backLink.href = 'blog.html';
        backLink.textContent = '← Tous les articles';
        content.append(backLink);
        children.push(content);

        const booking = document.createElement('aside');
        booking.className = 'article-booking';
        const bookingCopy = document.createElement('div');
        const bookingTitle = document.createElement('h2');
        bookingTitle.textContent = 'Une envie de nouvelles tresses ?';
        const bookingText = document.createElement('p');
        bookingText.textContent = 'Parlons de la coiffure qui vous ressemble.';
        bookingCopy.append(bookingTitle, bookingText);
        const bookingLink = document.createElement('a');
        bookingLink.className = 'booking-link';
        bookingLink.href = 'index.html#reservation';
        bookingLink.textContent = 'Prendre rendez-vous';
        booking.append(bookingCopy, bookingLink);
        children.push(booking);

        const relatedPosts = allPosts
            .filter(function (item) { return item.slug !== post.slug; })
            .sort(function (a, b) {
                return Number(b.category === post.category) - Number(a.category === post.category);
            })
            .slice(0, 2);
        if (relatedPosts.length) {
            const related = document.createElement('section');
            related.className = 'related-section';
            related.setAttribute('aria-labelledby', 'related-title');
            const relatedTitle = document.createElement('h2');
            relatedTitle.className = 'section-title';
            relatedTitle.id = 'related-title';
            relatedTitle.textContent = 'À lire aussi';
            const relatedGrid = document.createElement('div');
            relatedGrid.className = 'related-grid';
            relatedPosts.forEach(function (item) {
                relatedGrid.append(createRelatedCard(item));
            });
            related.append(relatedTitle, relatedGrid);
            children.push(related);
        }

        root.replaceChildren.apply(root, children);
    }

    function showUnavailable(message) {
        const notice = document.createElement('p');
        notice.className = 'article-error';
        notice.setAttribute('role', 'alert');
        notice.append(document.createTextNode(message + ' '));
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'read-link';
        retry.textContent = 'Réessayer';
        retry.addEventListener('click', loadArticle);
        const back = document.createElement('a');
        back.href = 'blog.html';
        back.textContent = 'Retourner au journal';
        notice.append(retry, document.createTextNode(' '), back);
        root.replaceChildren(notice);
    }

    async function loadArticle() {
        root.setAttribute('aria-busy', 'true');
        const requestedSlug = new URLSearchParams(window.location.search).get('slug');
        const pageName = window.location.pathname.split('/').pop();
        const slug = requestedSlug || Object.keys(window.LEGACY_BLOG_PAGES).find(function (key) {
            return window.LEGACY_BLOG_PAGES[key] === pageName;
        });
        if (!slug) {
            root.removeAttribute('aria-busy');
            showUnavailable('Cet article est introuvable.');
            return;
        }

        const [postResult, listResult] = await Promise.all([
            window.fetchPublishedBlogPost(slug),
            window.fetchPublishedBlogPosts()
        ]);
        root.removeAttribute('aria-busy');
        if (postResult.error || listResult.error) {
            showUnavailable('Le journal est temporairement indisponible.');
            return;
        }

        const post = postResult.post;
        if (!post) {
            const notice = document.createElement('p');
            notice.className = 'article-error';
            notice.setAttribute('role', 'status');
            notice.textContent = 'Cet article n’est pas disponible.';
            root.replaceChildren(notice);
            return;
        }
        setMetadata(post);
        renderArticle(post, listResult.posts);
    }

    loadArticle();
});

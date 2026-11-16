document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('blog-form');
    const list = document.getElementById('blog-list');
    const message = document.getElementById('blog-admin-message');
    const saveButton = document.getElementById('save-post-btn');
    const imageInput = document.getElementById('post-image-file');
    const imagePreview = document.getElementById('post-image-preview');
    const currentImage = document.getElementById('post-image-current');
    const imageUrlInput = document.getElementById('post-image-url');
    let previewObjectUrl = '';
    let slugEdited = false;

    if (!form || !list || !message) return;

    function showMessage(text, kind) {
        message.textContent = text;
        message.className = 'small mb-3 ' + (kind === 'error' ? 'text-danger' : kind === 'success' ? 'text-success' : 'text-body');
    }

    function today() {
        const now = new Date();
        return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    }

    function slugify(value) {
        return value.normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }

    function updatePreview(url) {
        if (!url) {
            imagePreview.hidden = true;
            imagePreview.replaceChildren();
            return;
        }
        const image = document.createElement('img');
        image.src = url;
        image.alt = document.getElementById('post-image-alt').value.trim() || 'Aperçu de la photo sélectionnée';
        imagePreview.replaceChildren(image);
        imagePreview.hidden = false;
    }

    function clearForm() {
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = '';
        form.reset();
        document.getElementById('post-id').value = '';
        imageUrlInput.value = '';
        imagePreview.hidden = true;
        imagePreview.replaceChildren();
        currentImage.hidden = true;
        form.hidden = true;
        document.getElementById('post-read-time').value = '5';
        document.getElementById('post-published-at').value = today();
        slugEdited = false;
        saveButton.disabled = false;
        saveButton.textContent = 'Enregistrer l’article';
    }

    function beginNewPost() {
        clearForm();
        form.hidden = false;
        document.getElementById('post-title').focus();
    }

    function buildPostCard(post) {
        const card = document.createElement('article');
        card.className = 'border-bottom py-3';
        const top = document.createElement('div');
        top.className = 'd-flex justify-content-between align-items-start gap-2';
        const detail = document.createElement('div');
        const title = document.createElement('h5');
        title.className = 'mb-1';
        title.textContent = post.title;
        const metadata = document.createElement('p');
        metadata.className = 'small mb-0';
        metadata.textContent = (post.category || 'Conseils') + ' · ' + (post.status === 'published' ? 'Publié' : 'Brouillon');
        detail.append(title, metadata);
        const actions = document.createElement('div');
        actions.className = 'd-flex gap-2 flex-shrink-0';

        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'btn btn-sm btn-outline-primary';
        edit.dataset.action = 'edit';
        edit.dataset.id = String(post.id);
        edit.textContent = 'Modifier';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn btn-sm btn-outline-danger';
        remove.dataset.action = 'delete';
        remove.dataset.id = String(post.id);
        remove.textContent = 'Supprimer';
        actions.append(edit, remove);
        top.append(detail, actions);
        card.append(top);
        return card;
    }

    async function renderPosts() {
        list.textContent = 'Chargement des articles…';
        const { data: posts, error } = await window.supabaseClient
            .from('posts')
            .select('id,title,slug,status,category,updated_at')
            .order('updated_at', { ascending: false });

        if (error) {
            console.error('Erreur de chargement des articles :', error);
            list.textContent = 'Impossible de charger les articles. Vérifiez que la migration 004_blog_cms.sql a été appliquée et que votre compte admin est autorisé.';
            return;
        }

        if (!posts.length) {
            list.textContent = 'Aucun article dans le blog. Importez les quatre articles existants ou créez le premier article.';
            return;
        }
        list.replaceChildren.apply(list, posts.map(buildPostCard));
    }

    async function editPost(id) {
        const { data, error } = await window.supabaseClient
            .from('posts')
            .select('id,title,slug,content,status,category,excerpt,image_url,image_alt,image_credit,image_source,read_time,published_at')
            .eq('id', id)
            .single();

        if (error) {
            console.error('Erreur d’ouverture de l’article :', error);
            showMessage('Impossible d’ouvrir cet article : ' + error.message, 'error');
            return;
        }

        document.getElementById('post-id').value = data.id;
        document.getElementById('post-title').value = data.title || '';
        document.getElementById('post-slug').value = data.slug || '';
        document.getElementById('post-category').value = data.category || '';
        document.getElementById('post-excerpt').value = data.excerpt || '';
        document.getElementById('post-content').value = data.content || '';
        document.getElementById('post-status').value = data.status || 'draft';
        document.getElementById('post-read-time').value = String(data.read_time || 5);
        document.getElementById('post-published-at').value = data.published_at
            ? data.published_at.slice(0, 10)
            : today();
        document.getElementById('post-image-alt').value = data.image_alt || '';
        document.getElementById('post-image-credit').value = data.image_credit || '';
        document.getElementById('post-image-source').value = data.image_source || '';
        imageUrlInput.value = window.getBlogImageUrl(data.image_url);
        imageInput.value = '';
        currentImage.hidden = !imageUrlInput.value;
        currentImage.textContent = imageUrlInput.value ? 'Photo actuelle enregistrée. Choisissez un fichier pour la remplacer.' : '';
        updatePreview(imageUrlInput.value);
        slugEdited = true;
        form.hidden = false;
        document.getElementById('post-title').focus();
    }

    async function deletePost(id) {
        if (!window.confirm('Supprimer définitivement cet article ?')) return;
        const { error } = await window.supabaseClient.from('posts').delete().eq('id', id);
        if (error) {
            console.error('Erreur de suppression :', error);
            showMessage('Impossible de supprimer cet article : ' + error.message, 'error');
            return;
        }
        showMessage('Article supprimé.', 'success');
        await renderPosts();
    }

    async function uploadImage(file, slug) {
        const extensions = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp'
        };
        if (!extensions[file.type] || file.size > 5 * 1024 * 1024) {
            throw new Error('Choisissez une image JPG, PNG ou WebP de 5 Mo maximum.');
        }

        const path = slug + '/' + crypto.randomUUID() + '.' + extensions[file.type];
        const { error } = await window.supabaseClient.storage
            .from('blog-images')
            .upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false });
        if (error) throw error;

        const { data } = window.supabaseClient.storage.from('blog-images').getPublicUrl(path);
        return { url: data.publicUrl, path: path };
    }

    async function savePost(event) {
        event.preventDefault();
        if (!form.reportValidity()) return;

        const id = document.getElementById('post-id').value;
        const title = document.getElementById('post-title').value.trim();
        const slug = document.getElementById('post-slug').value.trim();
        const category = document.getElementById('post-category').value.trim();
        const excerpt = document.getElementById('post-excerpt').value.trim();
        const imageAlt = document.getElementById('post-image-alt').value.trim();
        const imageCredit = document.getElementById('post-image-credit').value.trim();
        let imageSource = document.getElementById('post-image-source').value.trim();
        const status = document.getElementById('post-status').value;
        const file = imageInput.files[0];
        const content = window.sanitizeBlogHtml(document.getElementById('post-content').value);
        const readTime = Number(document.getElementById('post-read-time').value);
        const publishedDate = document.getElementById('post-published-at').value;

        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
            showMessage('L’adresse doit contenir uniquement des minuscules, chiffres et tirets.', 'error');
            return;
        }
        if (!content.trim()) {
            showMessage('Ajoutez du contenu à l’article avant de l’enregistrer.', 'error');
            return;
        }
        if (imageCredit || imageSource) {
            if (!imageCredit || !imageSource) {
                showMessage('Renseignez le crédit et le lien de la source photo ensemble.', 'error');
                return;
            }
            try {
                const sourceUrl = new URL(imageSource);
                if (!imageCredit || sourceUrl.protocol !== 'https:' || sourceUrl.username || sourceUrl.password) {
                    throw new Error('Ajoutez une source photo HTTPS valide.');
                }
                imageSource = sourceUrl.href;
            } catch (error) {
                showMessage('Ajoutez une source photo HTTPS valide.', 'error');
                return;
            }
        }
        if (!file && !imageUrlInput.value) {
            showMessage('Ajoutez une photo avant d’enregistrer l’article.', 'error');
            return;
        }

        saveButton.disabled = true;
        saveButton.textContent = 'Enregistrement…';
        showMessage('Enregistrement de l’article…');
        let uploadedPath = '';
        try {
            let imageUrl = imageUrlInput.value;
            if (file) {
                const uploaded = await uploadImage(file, slug);
                imageUrl = uploaded.url;
                uploadedPath = uploaded.path;
            }

            const post = {
                title: title,
                slug: slug,
                category: category,
                excerpt: excerpt,
                content: content,
                image_url: imageUrl,
                image_alt: imageAlt,
                image_credit: imageCredit || null,
                image_source: imageSource || null,
                read_time: readTime,
                status: status,
                published_at: publishedDate + 'T12:00:00.000Z'
            };
            const result = id
                ? await window.supabaseClient.from('posts').update(post).eq('id', id).select('id').single()
                : await window.supabaseClient.from('posts').insert(post).select('id').single();

            if (result.error) {
                if (uploadedPath) {
                    const { error: cleanupError } = await window.supabaseClient.storage
                        .from('blog-images').remove([uploadedPath]);
                    if (cleanupError) {
                        console.error('Erreur de nettoyage de la photo non enregistrée :', cleanupError);
                        throw new Error(result.error.message + ' La photo envoyée n’a pas pu être supprimée : ' + cleanupError.message);
                    }
                }
                throw result.error;
            }

            clearForm();
            showMessage(status === 'published' ? 'Article publié avec succès.' : 'Brouillon enregistré.', 'success');
            await renderPosts();
        } catch (error) {
            console.error('Erreur d’enregistrement de l’article :', error);
            showMessage('Impossible d’enregistrer l’article : ' + error.message, 'error');
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = 'Enregistrer l’article';
        }
    }

    async function importLegacyPosts() {
        if (!Array.isArray(window.BLOG_POSTS) || !window.BLOG_POSTS.length) {
            showMessage('Les articles historiques ne sont pas disponibles pour l’import.', 'error');
            return;
        }
        if (!window.confirm('Importer les quatre articles existants ? Les contenus et statuts existants sont conservés ; seuls les champs descriptifs manquants sont complétés.')) return;

        const legacyPosts = window.BLOG_POSTS.map(function (post) {
            return {
                title: post.title,
                slug: post.slug,
                content: window.sanitizeBlogHtml(post.content),
                status: 'published',
                category: post.category,
                excerpt: post.excerpt,
                image_url: post.image,
                image_alt: post.imageAlt,
                image_credit: post.imageCredit,
                image_source: post.imageSource,
                read_time: Number.parseInt(post.readTime, 10) || 5,
                published_at: post.date + 'T12:00:00.000Z'
            };
        });
        const button = document.getElementById('import-legacy-posts-btn');
        button.disabled = true;
        try {
            const { error: importError } = await window.supabaseClient.from('posts')
                .upsert(legacyPosts, { onConflict: 'slug', ignoreDuplicates: true });
            if (importError) throw importError;

            const { data: existingPosts, error: loadError } = await window.supabaseClient.from('posts')
                .select('id,slug,category,excerpt,image_url,image_alt,image_credit,image_source,read_time,published_at')
                .in('slug', legacyPosts.map(function (post) { return post.slug; }));
            if (loadError) throw loadError;

            for (const existing of existingPosts || []) {
                const legacy = legacyPosts.find(function (post) { return post.slug === existing.slug; });
                if (!legacy) continue;
                const missingFields = {};
                if (!existing.category || existing.category === 'Conseils') missingFields.category = legacy.category;
                if (!existing.excerpt) missingFields.excerpt = legacy.excerpt;
                if (!existing.image_url) missingFields.image_url = legacy.image_url;
                if (!existing.image_alt) missingFields.image_alt = legacy.image_alt;
                if (!existing.image_credit) missingFields.image_credit = legacy.image_credit;
                if (!existing.image_source) missingFields.image_source = legacy.image_source;
                if (!existing.read_time || existing.read_time === 5) missingFields.read_time = legacy.read_time;
                if (!existing.published_at) missingFields.published_at = legacy.published_at;
                if (Object.keys(missingFields).length) {
                    const { error: updateError } = await window.supabaseClient.from('posts')
                        .update(missingFields)
                        .eq('id', existing.id);
                    if (updateError) throw updateError;
                }
            }

            showMessage('Import terminé. Les contenus et statuts existants ont été conservés.', 'success');
            await renderPosts();
        } catch (error) {
            console.error('Erreur d’import des anciens articles :', error);
            showMessage('Impossible d’importer les articles : ' + error.message, 'error');
        } finally {
            button.disabled = false;
        }
    }

    document.getElementById('new-post-btn').addEventListener('click', beginNewPost);
    document.getElementById('cancel-post-btn').addEventListener('click', clearForm);
    document.getElementById('import-legacy-posts-btn').addEventListener('click', importLegacyPosts);
    form.addEventListener('submit', savePost);
    document.getElementById('post-title').addEventListener('input', function (event) {
        if (!slugEdited) document.getElementById('post-slug').value = slugify(event.target.value);
    });
    document.getElementById('post-slug').addEventListener('input', function () {
        slugEdited = true;
    });
    imageInput.addEventListener('change', function () {
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = imageInput.files[0] ? URL.createObjectURL(imageInput.files[0]) : '';
        updatePreview(previewObjectUrl || imageUrlInput.value);
    });
    list.addEventListener('click', function (event) {
        const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
        if (!target) return;
        if (target.dataset.action === 'edit') editPost(target.dataset.id);
        if (target.dataset.action === 'delete') deletePost(target.dataset.id);
    });

    window.supabaseClient.auth.onAuthStateChange(function (event) {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            window.setTimeout(renderPosts, 0);
        }
    });
    document.getElementById('post-published-at').value = today();
    renderPosts();
});

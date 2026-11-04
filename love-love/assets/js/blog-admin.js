// ============================================================
// GESTION DU BLOG
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    if (document.getElementById('blog-list')) {
        await renderPosts();
    }

    // Délégation d'événements (compatible CSP strict : pas d'onclick inline)
    const list = document.getElementById('blog-list');
    if (list && !list.dataset.blogReady) {
        list.dataset.blogReady = '1';
        list.addEventListener('click', function(e) {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            if (btn.dataset.action === 'edit') editPost(btn.dataset.id);
            else if (btn.dataset.action === 'delete') deletePost(btn.dataset.id);
        });
    }

    const newBtn = document.getElementById('new-post-btn');
    if (newBtn && !newBtn.dataset.ready) {
        newBtn.dataset.ready = '1';
        newBtn.addEventListener('click', togglePostForm);
    }
    const saveBtn = document.getElementById('save-post-btn');
    if (saveBtn && !saveBtn.dataset.ready) {
        saveBtn.dataset.ready = '1';
        saveBtn.addEventListener('click', savePost);
    }
});

// Éditer un article (pré-remplit le formulaire)
async function editPost(id) {
    const { data, error } = await supabaseClient.from('posts').select('*').eq('id', id).single();
    if (error) {
        console.error(error);
        return;
    }
    if (data) {
        document.getElementById('post-id').value = data.id;
        document.getElementById('post-title').value = data.title || '';
        document.getElementById('post-slug').value = data.slug || '';
        document.getElementById('post-content').value = data.content || '';
        document.getElementById('post-status').value = data.status || 'draft';
        document.getElementById('blog-form').style.display = 'block';
    }
}

function togglePostForm() {
    const form = document.getElementById('blog-form');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function renderPosts() {
    const list = document.getElementById('blog-list');
    
    const { data: posts, error } = await supabaseClient
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error(error);
        list.innerHTML = '<p>Erreur lors du chargement des articles.</p>';
        return;
    }

    list.innerHTML = posts.map(post => `
        <div class="card mb-2 p-2">
            <div class="d-flex justify-content-between align-items-center">
                <span><strong>${post.title}</strong> (${post.status})</span>
                <div>
                    <button class="btn btn-sm btn-outline-primary" data-action="edit" data-id="${post.id}">Éditer</button>
                    <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${post.id}">Supprimer</button>
                </div>
            </div>
        </div>
    `).join('');
}

async function savePost() {
    const id = document.getElementById('post-id').value;
    const title = document.getElementById('post-title').value;
    const slug = document.getElementById('post-slug').value;
    const content = document.getElementById('post-content').value;
    const status = document.getElementById('post-status').value;

    const postData = { title, slug, content, status };

    let error;
    if (id) {
        ({ error } = await supabaseClient.from('posts').update(postData).eq('id', id));
    } else {
        ({ error } = await supabaseClient.from('posts').insert([postData]));
    }

    if (error) {
        alert('Erreur : ' + error.message);
        return;
    }

    // Reset form
    document.getElementById('post-id').value = '';
    document.getElementById('post-title').value = '';
    document.getElementById('post-slug').value = '';
    document.getElementById('post-content').value = '';
    togglePostForm();
    await renderPosts();
}

async function deletePost(id) {
    if (!confirm('Supprimer cet article ?')) return;
    await supabaseClient.from('posts').delete().eq('id', id);
    await renderPosts();
}

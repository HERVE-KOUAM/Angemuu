// ============================================================
// GESTION DU BLOG
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    if (document.getElementById('blog-list')) {
        await renderPosts();
    }
});

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
                    <button class="btn btn-sm btn-outline-primary" onclick="editPost(${post.id})">Éditer</button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deletePost(${post.id})">Supprimer</button>
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

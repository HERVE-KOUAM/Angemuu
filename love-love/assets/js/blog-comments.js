document.addEventListener('DOMContentLoaded', () => {
    const commentForm = document.getElementById('comment-form');
    const commentsList = document.getElementById('comments-list');

    // Charger les commentaires
    async function loadComments() {
        const { data, error } = await window.supabaseClient
            .from('comments')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (data) {
            commentsList.innerHTML = data.map(c => `
                <div class="comment">
                    <p><span class="comment-icon">${c.icon || ''}</span> <strong>${c.name}</strong></p>
                    <p>${c.text}</p>
                </div>
            `).join('');
        }
    }

    // Poster
    if (commentForm) {
        commentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('comment-name').value;
            const icon = document.getElementById('comment-icon').value;
            const text = document.getElementById('comment-text').value;

            await window.supabaseClient.from('comments').insert([{ name, icon, text }]);
            commentForm.reset();
            loadComments();
        });
    }

    loadComments();
});

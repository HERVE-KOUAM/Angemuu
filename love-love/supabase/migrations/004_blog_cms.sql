-- Blog CMS fields, private drafts, and public article image storage.

alter table public.posts
    add column if not exists excerpt text not null default '',
    add column if not exists category text not null default 'Conseils',
    add column if not exists image_url text,
    add column if not exists image_alt text not null default '',
    add column if not exists image_credit text,
    add column if not exists image_source text,
    add column if not exists read_time integer not null default 5,
    add column if not exists published_at timestamptz,
    add column if not exists updated_at timestamptz not null default now();

create index if not exists posts_published_at_idx
    on public.posts (published_at desc)
    where status = 'published';

create or replace function public.set_post_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_posts_updated_at on public.posts;
create trigger set_posts_updated_at
    before update on public.posts
    for each row execute function public.set_post_updated_at();

drop policy if exists "Admins can manage posts" on public.posts;
drop policy if exists "Public can view published posts" on public.posts;
drop policy if exists "posts_select_public" on public.posts;
drop policy if exists "posts_select_published" on public.posts;
create policy "posts_select_published"
    on public.posts for select
    to anon, authenticated
    using (status = 'published');

drop policy if exists "posts_select_admin" on public.posts;
create policy "posts_select_admin"
    on public.posts for select
    to authenticated
    using (public.is_admin());

drop policy if exists "posts_insert_admin" on public.posts;
create policy "posts_insert_admin"
    on public.posts for insert
    to authenticated
    with check (public.is_admin());

drop policy if exists "posts_update_admin" on public.posts;
create policy "posts_update_admin"
    on public.posts for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

drop policy if exists "posts_delete_admin" on public.posts;
create policy "posts_delete_admin"
    on public.posts for delete
    to authenticated
    using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'blog-images',
    'blog-images',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "blog_images_insert_admin" on storage.objects;
create policy "blog_images_insert_admin"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'blog-images' and public.is_admin());

drop policy if exists "blog_images_update_admin" on storage.objects;
create policy "blog_images_update_admin"
    on storage.objects for update
    to authenticated
    using (bucket_id = 'blog-images' and public.is_admin())
    with check (bucket_id = 'blog-images' and public.is_admin());

drop policy if exists "blog_images_delete_admin" on storage.objects;
create policy "blog_images_delete_admin"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'blog-images' and public.is_admin());

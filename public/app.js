// public/app.js
// Fieldnotes SPA — hash-based routing, vanilla JS, no build step.
// Routes: #/feed, #/post/:id, #/gallery, #/categories, #/login, #/register

/* ===================== STATE ===================== */
const state = {
  currentUser: null,
  categories: [],
  participants: [],
  gallerySearchTerm: '',
  feedState: { filter: 'recent', sort: 'newest', categoryId: null, page: 1, hasMore: false },
};

function getToken() {
  return localStorage.getItem('token');
}

function setAuth(user, token) {
  state.currentUser = user;
  if (token) localStorage.setItem('token', token);
  if (user) localStorage.setItem('user', JSON.stringify(user));
  renderHeader();
}

function clearAuth() {
  state.currentUser = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  renderHeader();
}

function loadAuth() {
  const userRaw = localStorage.getItem('user');
  if (userRaw) {
    try { state.currentUser = JSON.parse(userRaw); } catch {}
  }
}

/* ===================== URL HELPERS ===================== */
function parseHash() {
  const hash = location.hash.replace('#', '') || '/feed';
  const [pathPart, queryPart = ''] = hash.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  const [base, ...rest] = path.slice(1).split('/');
  const param = rest.join('/');
  const query = Object.fromEntries(
    queryPart.split('&').filter(Boolean).map((pair) => {
      const [key, value = ''] = pair.split('=');
      return [decodeURIComponent(key), decodeURIComponent(value)];
    })
  );
  return { route: base || 'feed', param, query };
}

function buildHash(route, param = '', query = {}) {
  const parts = [`/${route}${param ? `/${param}` : ''}`];
  const filtered = Object.entries(query).filter(([, value]) => value !== null && value !== '' && value !== undefined);
  if (filtered.length) {
    const queryString = filtered.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
    parts.push(`?${queryString}`);
  }
  return `#${parts.join('')}`;
}

function getQueryValue(name) {
  return parseHash().query[name] || '';
}

function goToLogin(returnTo = location.hash || '#/feed') {
  sessionStorage.setItem('returnTo', returnTo);
  location.hash = '#/login';
}

/* ===================== API HELPERS ===================== */
const API_BASE = '/api';

async function api(path, opts = {}) {
  const url = `${API_BASE}${path}`;
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/* ===================== TOAST ===================== */
function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast' + (isError ? ' error' : '') + ' show';
  setTimeout(() => el.classList.remove('show'), 3000);
}

/* ===================== HEADER ===================== */
function renderHeader() {
  const area = document.getElementById('authArea');
  if (!area) return;
  if (state.currentUser) {
    area.innerHTML = `
      <span class="user-chip">Hi, <strong>${escapeHtml(state.currentUser.username)}</strong>${state.currentUser.role === 'admin' ? ' <span class="stamp pine">admin</span>' : ''}</span>
      <button class="secondary" onclick="openNewPostModal()">New post</button>
      <button class="ghost" onclick="logout()">Log out</button>
    `;
  } else {
    area.innerHTML = `<a href="#/login" class="btn">Log in</a><a href="#/register" class="btn secondary">Join</a>`;
  }
}

function logout() {
  clearAuth();
  location.hash = '#/feed';
}

/* ===================== ROUTER ===================== */
const routes = {
  feed: renderFeed,
  post: renderPost,
  gallery: renderGallery,
  categories: renderCategories,
  login: renderLogin,
  register: renderRegister,
};

function navigate() {
  const { route, param, query } = parseHash();

  document.querySelectorAll('.main-nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === route);
  });

  const app = document.getElementById('app');
  app.innerHTML = '';

  const handler = routes[route];
  if (handler) handler(param, query);
  else location.hash = '#/feed';
}

window.addEventListener('hashchange', navigate);

/* ===================== UI HELPERS ===================== */
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function getInitials(name) {
  if (!name) return '?';
  const words = String(name).trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function formatRelativeTime(value) {
  const date = new Date(value);
  const diff = Math.max(1, Math.round((Date.now() - date.getTime()) / 1000));
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}

function renderLoadingState(container, kind = 'feed') {
  const skeletons = kind === 'post'
    ? ['<div class="skeleton-card large"></div>', '<div class="skeleton-card"></div>']
    : ['<div class="skeleton-card"></div>', '<div class="skeleton-card"></div>'];
  container.innerHTML = `<div class="skeleton-stack">${skeletons.join('')}</div>`;
}

/* ===================== FEED ===================== */
async function renderPostList(container, filter = 'recent', categoryId = null, sort = 'newest', page = 1, append = false) {
  if (!append) {
    renderLoadingState(container);
  }
  try {
    let url = `/posts?filter=${filter}&sort=${sort}&page=${page}&limit=6`;
    if (categoryId) url += `&categoryId=${categoryId}`;
    const { posts, hasMore } = await api(url);
    state.feedState.hasMore = hasMore;
    if (!posts.length) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No posts in this category yet.</p>
          <p style="font-size:0.85rem;margin-top:8px">Be the first to share something with the community.</p>
        </div>
      `;
      return;
    }
    const markup = posts.map((p) => `
      <article class="card post-card" onclick="location.hash='${buildHash('post', p.id)}'">
        <div class="punch"></div>
        <div class="post-card-head">
          <div>
            ${p.categoryTitle ? `<span class="category-badge"><a href="${buildHash('feed', '', { category: p.categoryId })}" onclick="event.stopPropagation()">${escapeHtml(p.categoryTitle)}</a></span>` : ''}
            <h3 class="post-title">${escapeHtml(p.title)}</h3>
            <div class="post-meta">
              <span class="avatar">${escapeHtml(getInitials(p.authorUsername))}</span>
              ${escapeHtml(p.authorUsername)} &middot; ${formatRelativeTime(p.createdAt)}
            </div>
          </div>
        </div>
        ${p.mediaUrl ? (p.mediaType === 'video'
          ? `<video class="post-media" controls preload="metadata" src="${escapeHtml(p.mediaUrl)}"></video>`
          : `<img class="post-media" src="${escapeHtml(p.mediaUrl)}" alt="${escapeHtml(p.title)}" />`) : ''}
        <p class="post-snippet">${escapeHtml(p.content.slice(0, 180))}${p.content.length > 180 ? '…' : ''}</p>
        <div class="post-stats">
          <span>${p.likeCount} like${p.likeCount !== 1 ? 's' : ''}</span>
          <span>${p.commentCount} comment${p.commentCount !== 1 ? 's' : ''}</span>
        </div>
      </article>
    `).join('');

    if (append) {
      container.insertAdjacentHTML('beforeend', markup);
    } else {
      container.innerHTML = markup;
    }

    const existingPager = document.getElementById('feedPager');
    if (existingPager) existingPager.remove();
    if (hasMore) {
      container.insertAdjacentHTML('beforeend', '<div id="feedPager" class="feed-pagination"><button id="loadMoreBtn">Load more</button></div>');
      document.getElementById('loadMoreBtn').addEventListener('click', () => {
        const nextPage = page + 1;
        state.feedState.page = nextPage;
        const nextQuery = {
          filter,
          sort,
          category: categoryId || '',
          page: nextPage,
        };
        history.replaceState(null, '', `${location.pathname}${location.hash.split('?')[0]}?${new URLSearchParams(nextQuery).toString()}`);
        renderPostList(container, filter, categoryId, sort, nextPage, true);
      });
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state" style="border-color:var(--rust);color:var(--rust)"><p>${escapeHtml(err.message)}</p></div>`;
  }
}

async function renderTopParticipants(container) {
  try {
    const { participants } = await api('/posts/participants');
    if (!participants.length) {
      container.innerHTML = '<p class="panel-sub">No posts yet — be the first to start a conversation.</p>';
      return;
    }
    container.innerHTML = participants.map((participant, index) => `
      <div class="top-participant-item">
        <div class="top-participant-rank">#${index + 1}</div>
        <div class="top-participant-meta">
          <strong>${escapeHtml(participant.username)}</strong>
          <span>${participant.postCount} post${participant.postCount !== 1 ? 's' : ''}</span>
        </div>
      </div>
    `).join('');
  } catch {
    container.innerHTML = '<p class="panel-sub">We could not load contributors right now.</p>';
  }
}

async function renderFeed(param = '', query = {}) {
  const app = document.getElementById('app');
  const selectedCategoryId = query.category ? parseInt(query.category, 10) : null;
  const selectedSort = query.sort || 'newest';
  const selectedFilter = query.filter || 'recent';
  const selectedPage = Math.max(1, parseInt(query.page, 10) || 1);
  state.feedState = { filter: selectedFilter, sort: selectedSort, categoryId: selectedCategoryId, page: selectedPage, hasMore: false };

  app.innerHTML = `
    <div class="feed-layout">
      <div class="feed-main">
        <div class="feed-toolbar">
          <div class="tab-switch">
            <button class="${selectedFilter === 'recent' ? 'active' : ''}" data-filter="recent">Recent</button>
            <button class="${selectedFilter === 'popular' ? 'active' : ''}" data-filter="popular">Popular</button>
          </div>
          <div class="feed-actions">
            <select id="sortSelect">
              <option value="newest" ${selectedSort === 'newest' ? 'selected' : ''}>Newest</option>
              <option value="oldest" ${selectedSort === 'oldest' ? 'selected' : ''}>Oldest</option>
              <option value="popular" ${selectedSort === 'popular' ? 'selected' : ''}>Most liked</option>
            </select>
            ${state.currentUser ? `<button onclick="openNewPostModal()">New post</button>` : ''}
          </div>
        </div>
        <div class="category-filter-bar" id="categoryFilterBar"></div>
        <div class="post-list" id="postList"></div>
      </div>
      <aside class="feed-aside">
        <div class="card panel-card">
          <h3 class="panel-title">Top contributors</h3>
          <p class="panel-sub">The participants with the most posts.</p>
          <div id="topParticipantsList"></div>
        </div>
      </aside>
    </div>
  `;

  await renderCategoryFilterBar(document.getElementById('categoryFilterBar'), selectedCategoryId);
  await renderTopParticipants(document.getElementById('topParticipantsList'));

  const list = document.getElementById('postList');
  const tabs = app.querySelectorAll('.tab-switch button');
  const sortSelect = document.getElementById('sortSelect');
  tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      const filterValue = btn.dataset.filter;
      state.feedState.filter = filterValue;
      state.feedState.page = 1;
      const nextQuery = { ...query, filter: filterValue, sort: state.feedState.sort, category: selectedCategoryId || '', page: 1 };
      location.hash = buildHash('feed', '', nextQuery);
    });
  });
  sortSelect.addEventListener('change', (e) => {
    const sortValue = e.target.value;
    state.feedState.sort = sortValue;
    state.feedState.page = 1;
    const nextQuery = { ...query, filter: state.feedState.filter, sort: sortValue, category: selectedCategoryId || '', page: 1 };
    location.hash = buildHash('feed', '', nextQuery);
  });

  renderPostList(list, state.feedState.filter, selectedCategoryId, state.feedState.sort, state.feedState.page);
}

async function renderCategoryFilterBar(container, selectedId) {
  try {
    const { categories } = await api('/categories');
    state.categories = categories;
    if (!categories.length) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = `
      <span class="category-filter-label">Filter:</span>
      <button class="category-chip ${!selectedId ? 'active' : ''}" onclick="location.hash='${buildHash('feed', '', { category: '' })}'">All</button>
      ${categories.map((c) => `
        <button class="category-chip ${selectedId === c.id ? 'active' : ''}" onclick="location.hash='${buildHash('feed', '', { category: c.id, filter: state.feedState.filter, sort: state.feedState.sort })}'">${escapeHtml(c.title)}</button>
      `).join('')}
    `;
  } catch {
    container.innerHTML = '';
  }
}

/* ===================== SINGLE POST ===================== */
async function renderPost(id) {
  const app = document.getElementById('app');
  renderLoadingState(app, 'post');
  try {
    const { post, comments } = await api(`/posts/${id}`);
    const canManagePost = state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.id === post.authorId);
    app.innerHTML = `
      <a href="${buildHash('feed', '', { category: state.feedState.categoryId || '' })}" class="back-link">← Back to feed</a>
      <article class="card post-full" style="margin-top:18px">
        <div class="punch"></div>
        ${post.categoryTitle ? `<span class="category-badge"><a href="${buildHash('feed', '', { category: post.categoryId })}">${escapeHtml(post.categoryTitle)}</a></span>` : ''}
        <h1 class="post-title">${escapeHtml(post.title)}</h1>
        <div class="post-meta">
          <span class="avatar">${escapeHtml(getInitials(post.authorUsername))}</span>
          ${escapeHtml(post.authorUsername)} &middot; ${formatRelativeTime(post.createdAt)}
        </div>
        ${post.mediaUrl ? (post.mediaType === 'video'
          ? `<video class="post-media full" controls preload="metadata" src="${escapeHtml(post.mediaUrl)}"></video>`
          : `<img class="post-media full" src="${escapeHtml(post.mediaUrl)}" alt="${escapeHtml(post.title)}" />`) : ''}
        ${post.content ? `<div class="post-body">${escapeHtml(post.content)}</div>` : ''}
        <div class="post-stats">
          ${state.currentUser
            ? `<button class="like-btn ${post.likedByMe ? 'liked' : ''}" id="likeBtn">${post.likedByMe ? '♥' : '♡'} ${post.likeCount} like${post.likeCount !== 1 ? 's' : ''}</button>`
            : `<span>${post.likeCount} like${post.likeCount !== 1 ? 's' : ''}</span>`}
          <span>${post.commentCount} comment${post.commentCount !== 1 ? 's' : ''}</span>
          ${canManagePost ? `<button class="secondary" id="editPostBtn">Edit</button>` : ''}
          ${canManagePost ? `<button class="danger" id="deletePostBtn">Delete</button>` : ''}
        </div>
      </article>
      <section class="comments-section">
        <h3 style="font-family:Fraunces,serif;font-size:1.2rem">Comments</h3>
        ${comments.length ? comments.map((c) => `
          <div class="comment">
            <div class="comment-meta">
              <span class="avatar">${escapeHtml(getInitials(c.authorUsername))}</span>
              ${escapeHtml(c.authorUsername)} &middot; ${formatRelativeTime(c.createdAt)}
            </div>
            <p class="comment-text">${escapeHtml(c.text)}</p>
            ${state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.id === c.authorId) ? `<div class="comment-actions"><button class="secondary" data-comment-edit="${c.id}">Edit</button><button class="danger" data-comment-delete="${c.id}">Delete</button></div>` : ''}
          </div>
        `).join('') : '<p style="color:var(--ink-soft)">No comments yet.</p>'}
        ${state.currentUser ? `
          <form class="comment-form" id="commentForm">
            <textarea placeholder="Write a comment…" required></textarea>
            <button type="submit">Post</button>
          </form>
        ` : '<p style="color:var(--ink-soft);font-size:0.9rem"><a href="#/login">Log in</a> to comment.</p>'}
      </section>
    `;

    const likeBtn = document.getElementById('likeBtn');
    if (likeBtn) {
      likeBtn.addEventListener('click', async () => {
        try {
          const data = await api(`/posts/${id}/like`, { method: 'POST' });
          likeBtn.classList.toggle('liked', data.liked);
          likeBtn.textContent = `${data.liked ? '♥' : '♡'} ${data.likeCount} like${data.likeCount !== 1 ? 's' : ''}`;
        } catch (err) { toast(err.message, true); }
      });
    }

    const editBtn = document.getElementById('editPostBtn');
    if (editBtn) {
      editBtn.addEventListener('click', () => openEditPostModal(post));
    }
    const deleteBtn = document.getElementById('deletePostBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (!confirm('Delete this post?')) return;
        try {
          await api(`/posts/${id}`, { method: 'DELETE' });
          toast('Post deleted.');
          location.hash = buildHash('feed', '', { category: state.feedState.categoryId || '' });
        } catch (err) { toast(err.message, true); }
      });
    }

    document.querySelectorAll('[data-comment-edit]').forEach((btn) => {
      const comment = comments.find((entry) => entry.id === Number(btn.dataset.commentEdit));
      btn.addEventListener('click', () => openEditCommentModal(id, Number(btn.dataset.commentEdit), comment?.text || ''));
    });
    document.querySelectorAll('[data-comment-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this comment?')) return;
        try {
          await api(`/posts/${id}/comments/${btn.dataset.commentDelete}`, { method: 'DELETE' });
          toast('Comment deleted.');
          renderPost(id);
        } catch (err) { toast(err.message, true); }
      });
    });

    const form = document.getElementById('commentForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = form.querySelector('textarea').value;
        try {
          await api(`/posts/${id}/comments`, { method: 'POST', body: JSON.stringify({ text }) });
          toast('Comment posted!');
          renderPost(id);
        } catch (err) { toast(err.message, true); }
      });
    }
  } catch (err) {
    app.innerHTML = `<div class="empty-state" style="border-color:var(--rust);color:var(--rust)"><p>${escapeHtml(err.message)}</p></div>`;
  }
}

/* ===================== NEW POST MODAL ===================== */
async function openNewPostModal() {
  if (!state.currentUser) { goToLogin(location.hash); return; }

  // Load categories for the dropdown
  let categoryOptions = '<option value="">— No category —</option>';
  try {
    const { categories } = await api('/categories');
    state.categories = categories;
    categoryOptions += categories.map((c) => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join('');
  } catch {}

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="card modal">
      <div class="punch"></div>
      <h2>New post</h2>
      <form id="newPostForm">
        <div class="field">
          <label for="postCategory">Category</label>
          <select id="postCategory">${categoryOptions}</select>
        </div>
        <div class="field">
          <label for="postTitle">Title</label>
          <input id="postTitle" type="text" required maxlength="200" />
        </div>
        <div class="field">
          <label for="postContent">Content</label>
          <textarea id="postContent" placeholder="Optional if you’re sharing a photo or video"></textarea>
        </div>
        <div class="field">
          <label for="postMedia">Image or video</label>
          <input id="postMedia" type="file" accept="image/*,video/*" />
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
          <button type="submit">Publish</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  backdrop.querySelector('#newPostForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = backdrop.querySelector('#newPostForm button[type="submit"]');
    const title = backdrop.querySelector('#postTitle').value;
    const content = backdrop.querySelector('#postContent').value;
    const categoryId = backdrop.querySelector('#postCategory').value || null;
    const mediaFile = backdrop.querySelector('#postMedia').files[0];
    const formData = new FormData();
    formData.append('title', title);
    formData.append('content', content);
    if (categoryId) formData.append('categoryId', categoryId);
    if (mediaFile) formData.append('media', mediaFile);
    submitBtn.disabled = true;
    submitBtn.textContent = 'Publishing…';
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast('Post published!');
      backdrop.remove();
      location.hash = '#/feed';
    } catch (err) {
      toast(err.message, true);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Publish';
    }
  });
}

/* ===================== CATEGORIES PAGE ===================== */
async function renderCategories() {
  const app = document.getElementById('app');
  app.innerHTML = '<p style="color:var(--ink-soft)">Loading categories…</p>';
  try {
    const { categories } = await api('/categories');
    state.categories = categories;

    let html = `
      <h2 class="panel-title" style="margin-top:24px">Categories</h2>
      <p class="panel-sub">Browse posts by topic.</p>
      <div class="categories-grid">
    `;

    // Add "Create category" card for logged-in users
    if (state.currentUser) {
      html += `
        <div class="card add-category-card" onclick="openNewCategoryModal()">
          <span>+ New Category</span>
        </div>
      `;
    }

    if (!categories.length) {
      html += `<div class="card" style="grid-column:1/-1;text-align:center;color:var(--ink-soft)"><p>No categories yet.</p></div>`;
    } else {
      html += categories.map((c) => `
        <div class="card category-card" onclick="location.hash='#/feed?category=${c.id}'">
          <div class="punch"></div>
          <h3 class="category-card-title">${escapeHtml(c.title)}</h3>
          <div class="category-card-count">Click to filter posts</div>
        </div>
      `).join('');
    }

    html += '</div>';
    app.innerHTML = html;
  } catch (err) {
    app.innerHTML = `<div class="empty-state" style="border-color:var(--rust);color:var(--rust)"><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function openEditPostModal(post) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="card modal">
      <div class="punch"></div>
      <h2>Edit post</h2>
      <form id="editPostForm">
        <div class="field">
          <label for="editPostCategory">Category</label>
          <select id="editPostCategory"></select>
        </div>
        <div class="field">
          <label for="editPostTitle">Title</label>
          <input id="editPostTitle" type="text" value="${escapeHtml(post.title)}" required maxlength="200" />
        </div>
        <div class="field">
          <label for="editPostContent">Content</label>
          <textarea id="editPostContent" placeholder="Optional if you’re sharing a photo or video">${escapeHtml(post.content)}</textarea>
        </div>
        <div class="field">
          <label for="editPostMedia">Replace media</label>
          <input id="editPostMedia" type="file" accept="image/*,video/*" />
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
          <button type="submit">Save</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);

  const categorySel = backdrop.querySelector('#editPostCategory');
  categorySel.innerHTML = '<option value="">— No category —</option>';
  state.categories.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.title;
    if (c.id === post.categoryId) opt.selected = true;
    categorySel.appendChild(opt);
  });

  backdrop.querySelector('#editPostForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = backdrop.querySelector('#editPostForm button[type="submit"]');
    const title = backdrop.querySelector('#editPostTitle').value;
    const content = backdrop.querySelector('#editPostContent').value;
    const categoryId = backdrop.querySelector('#editPostCategory').value || null;
    const mediaFile = backdrop.querySelector('#editPostMedia').files[0];
    const formData = new FormData();
    formData.append('title', title);
    formData.append('content', content);
    if (categoryId) formData.append('categoryId', categoryId);
    if (mediaFile) formData.append('media', mediaFile);
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';
    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast('Post updated!');
      backdrop.remove();
      renderPost(post.id);
      if (data.post) {
        state.feedState = { ...state.feedState };
      }
    } catch (err) {
      toast(err.message, true);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save';
    }
  });
}

function openEditCommentModal(postId, commentId, currentText = '') {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="card modal">
      <div class="punch"></div>
      <h2>Edit comment</h2>
      <form id="editCommentForm">
        <div class="field">
          <label for="editCommentText">Comment</label>
          <textarea id="editCommentText" required>${escapeHtml(currentText)}</textarea>
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
          <button type="submit">Save</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);

  const textArea = backdrop.querySelector('#editCommentText');
  textArea.value = currentText;
  backdrop.querySelector('#editCommentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = textArea.value;
    try {
      await api(`/posts/${postId}/comments/${commentId}`, { method: 'PUT', body: JSON.stringify({ text }) });
      toast('Comment updated!');
      backdrop.remove();
      renderPost(postId);
    } catch (err) {
      toast(err.message, true);
    }
  });
}

function openNewCategoryModal() {
  if (!state.currentUser) { goToLogin(location.hash); return; }

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="card modal">
      <div class="punch"></div>
      <h2>New category</h2>
      <form id="newCategoryForm">
        <div class="field">
          <label for="catTitle">Title</label>
          <input id="catTitle" type="text" required maxlength="100" placeholder="e.g., Field Reports" />
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
          <button type="submit">Create</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  backdrop.querySelector('#newCategoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = backdrop.querySelector('#catTitle').value;
    try {
      await api('/categories', {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      toast('Category created!');
      backdrop.remove();
      renderCategories();
    } catch (err) {
      toast(err.message, true);
    }
  });
}

/* ===================== GALLERY ===================== */
async function renderGallery() {
  const app = document.getElementById('app');
  app.innerHTML = '<p style="color:var(--ink-soft)">Loading gallery…</p>';
  try {
    const { participants } = await api('/gallery');
    state.participants = participants;
    const isAdmin = state.currentUser?.role === 'admin';
    const searchTerm = state.gallerySearchTerm.trim().toLowerCase();
    const filteredParticipants = participants.filter((p) => {
      if (!searchTerm) return true;
      return `${p.name} ${p.role || ''}`.toLowerCase().includes(searchTerm);
    });

    let html = `
      <h2 class="panel-title" style="margin-top:24px">Gallery</h2>
      <p class="panel-sub">Community participants.</p>
      <div class="field" style="max-width:320px;margin-bottom:16px">
        <label for="gallerySearch">Search participants</label>
        <input id="gallerySearch" type="search" value="${escapeHtml(state.gallerySearchTerm)}" placeholder="Search by name or role" />
      </div>
      <div class="gallery-grid">
    `;
    if (isAdmin) {
      html += `<div class="card add-participant-card" onclick="openAddParticipantForm()">+ Add Participant</div>`;
    }
    if (!filteredParticipants.length) {
      html += `<div class="card" style="grid-column:1/-1;text-align:center;color:var(--ink-soft)"><p>No participants match your search yet.</p></div>`;
    } else {
      html += filteredParticipants.map((p) => `
        <div class="card participant-card">
          ${p.imageUrl ? `<img src="${escapeHtml(p.imageUrl)}" class="participant-photo" alt="${escapeHtml(p.name)}">` : `<div class="participant-photo placeholder">${p.name.charAt(0)}</div>`}
          <div class="participant-name">${escapeHtml(p.name)}</div>
          <div class="participant-role">${escapeHtml(p.role || '')}</div>
          ${isAdmin ? `<div class="participant-actions"><button onclick="openEditParticipantForm(${p.id})">Edit</button><button class="danger" onclick="deleteParticipant(${p.id})">Delete</button></div>` : ''}
        </div>
      `).join('');
    }
    html += '</div>';
    app.innerHTML = html;

    const searchInput = document.getElementById('gallerySearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.gallerySearchTerm = e.target.value;
        renderGallery();
      });
    }
  } catch (err) {
    app.innerHTML = `<div class="empty-state" style="border-color:var(--rust);color:var(--rust)"><p>${escapeHtml(err.message)}</p></div>`;
  }
}
async function deleteParticipant(id) {
  // Optional but recommended: confirm before deleting
  if (!confirm('Are you sure you want to delete this participant?')) return;

  try {
    // Call the backend DELETE route
    const response = await fetch(`/api/gallery/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${getToken()}`
      }
    });

    if (response.ok) {
      // Re-render the gallery to remove the deleted card from the screen
      renderGallery();
    } else {
      const data = await response.json();
      alert(`Error: ${data.error}`);
    }
  } catch (error) {
    console.error('Failed to delete participant:', error);
    alert('Failed to connect to the server.');
  }
}

function openAddParticipantForm() {
  if (!state.currentUser) { goToLogin(location.hash); return; }

  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.innerHTML = `
    <div class="modal card">
      <h3 class="panel-title">Add Participant</h3>
      <form id="add-participant-form">
        <label class="label">Name
          <input type="text" name="name" required>
        </label>
        <label class="label">Role
          <input type="text" name="role" placeholder="e.g. Volunteer">
        </label>
        <label class="label"> Photo (optional)
          <input type="file" name="image" accept=".jpg,.jpeg,.png,.webp,.gif" id="participantImageInput">
        </label>
        <div id="imagePreview" class="image-preview"></div>
        <p class="form-error" style="color:var(--rust);display:none"></p>
        <div class="modal-actions">
          <button type="button" class="secondary" id="add-participant-cancel">Cancel</button>
          <button type="submit">Add participant</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  const form = overlay.querySelector('#add-participant-form');
  const errorEl = overlay.querySelector('.form-error');
  const preview = overlay.querySelector('#imagePreview');
  const imageInput = overlay.querySelector('#participantImageInput');
  const close = () => overlay.remove();

  overlay.querySelector('#add-participant-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (!file) {
      preview.innerHTML = '';
      return;
    }
    const url = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${url}" alt="Preview" class="preview-image" />`;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const nameValue = form.querySelector('input[name="name"]').value;

    if (!nameValue.trim()) {
      errorEl.textContent = 'Name is required.';
      errorEl.style.display = 'block';
      return;
    }
    errorEl.style.display = 'none';

    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding…';
    try {
      const res = await fetch('/api/gallery', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: new FormData(form),
      });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(resData.error || `HTTP ${res.status}`);
      toast('Participant added!');
      close();
      renderGallery();
    } catch (err) {
      errorEl.textContent = err.message || 'Failed to add participant.';
      errorEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add';
    }
  });
}

function openEditParticipantForm(id) {
  const participant = (state.participants || []).find((p) => p.id === id);
  if (!participant) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.innerHTML = `
    <div class="modal card">
      <h3 class="panel-title">Edit Participant</h3>
      <form id="edit-participant-form">
        <label class="label">Name
          <input type="text" name="name" value="${escapeHtml(participant.name)}" required>
        </label>
        <label class="label">Role
          <input type="text" name="role" value="${escapeHtml(participant.role || '')}" placeholder="e.g. Volunteer">
        </label>
        <label class="label"> Replace photo (optional)
          <input type="file" name="imageUrl" accept=".jpg,.jpeg,.png,.webp,.gif" id="editParticipantImageInput">
        </label>
        ${participant.imageUrl ? `<div class="image-preview"><img src="${escapeHtml(participant.imageUrl)}" alt="Current preview" class="preview-image" /></div>` : '<div class="image-preview"></div>'}
        <p class="form-error" style="color:var(--rust);display:none"></p>
        <div class="modal-actions">
          <button type="button" class="secondary" id="edit-participant-cancel">Cancel</button>
          <button type="submit">Save</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  const form = overlay.querySelector('#edit-participant-form');
  const errorEl = overlay.querySelector('.form-error');
  const close = () => overlay.remove();

  overlay.querySelector('#edit-participant-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const imageInput = overlay.querySelector('#editParticipantImageInput');
  imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const preview = overlay.querySelector('.image-preview');
    preview.innerHTML = `<img src="${url}" alt="Preview" class="preview-image" />`;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const nameValue = form.querySelector('input[name="name"]').value;

    if (!nameValue.trim()) {
      errorEl.textContent = 'Name is required.';
      errorEl.style.display = 'block';
      return;
    }
    errorEl.style.display = 'none';

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';
    try {
      const res = await fetch(`/api/gallery/${id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: new FormData(form),
      });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(resData.error || `HTTP ${res.status}`);
      toast('Participant updated!');
      close();
      renderGallery();
    } catch (err) {
      errorEl.textContent = err.message || 'Failed to update participant.';
      errorEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save';
    }
  });
}

/* ===================== AUTH PAGES ===================== */
function renderLogin() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="auth-shell">
      <h2 class="panel-title">Welcome back</h2>
      <p class="panel-sub">Log in to your Fieldnotes account.</p>
      <form id="loginForm">
        <div class="field">
          <label>Email</label>
          <input type="email" id="loginEmail" required />
        </div>
        <div class="field">
          <label>Password</label>
          <div class="password-row">
            <input type="password" id="loginPassword" required minlength="8" />
            <button type="button" class="password-toggle" data-target="loginPassword">Show</button>
          </div>
        </div>
        <div class="field-error" id="loginError"></div>
        <button type="submit" style="width:100%">Log in</button>
      </form>
      <p class="auth-switch">Need an account? <a href="#/register">Join</a></p>
    </div>
  `;
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.currentTarget.querySelector('button[type="submit"]');
    const errEl = document.getElementById('loginError');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in…';
    errEl.textContent = '';
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: document.getElementById('loginEmail').value,
          password: document.getElementById('loginPassword').value,
        }),
      });
      setAuth(data.user, data.token);
      toast(`Welcome back, ${data.user.username}!`);
      const returnTo = sessionStorage.getItem('returnTo') || '#/feed';
      sessionStorage.removeItem('returnTo');
      location.hash = returnTo;
    } catch (err) {
      errEl.textContent = err.message || 'Unable to log in.';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Log in';
    }
  });

  document.querySelectorAll('.password-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      const showing = target.type === 'text';
      target.type = showing ? 'password' : 'text';
      btn.textContent = showing ? 'Show' : 'Hide';
    });
  });
}

function renderRegister() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="auth-shell">
      <h2 class="panel-title">Join Fieldnotes</h2>
      <p class="panel-sub">Create an account to start writing.</p>
      <form id="registerForm">
        <div class="field">
          <label>Username</label>
          <input type="text" id="regUsername" required maxlength="30" />
        </div>
        <div class="field">
          <label>Email</label>
          <input type="email" id="regEmail" required />
        </div>
        <div class="field">
          <label>Password</label>
          <div class="password-row">
            <input type="password" id="regPassword" required minlength="8" />
            <button type="button" class="password-toggle" data-target="regPassword">Show</button>
          </div>
          <div class="field-error" id="regError"></div>
        </div>
        <button type="submit" style="width:100%">Create account</button>
      </form>
      <p class="auth-switch">Already have an account? <a href="#/login">Log in</a></p>
    </div>
  `;
  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.currentTarget.querySelector('button[type="submit"]');
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const errEl = document.getElementById('regError');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = 'Please enter a valid email.'; return; }
    if (password.length < 8) { errEl.textContent = 'Password must be at least 8 characters.'; return; }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account…';
    errEl.textContent = '';
    try {
      const data = await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: document.getElementById('regUsername').value,
          email,
          password,
        }),
      });
      setAuth(data.user, data.token);
      toast('Account created!');
      location.hash = '#/feed';
    } catch (err) {
      errEl.textContent = err.message || 'Unable to create account.';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create account';
    }
  });

  document.querySelectorAll('.password-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      const showing = target.type === 'text';
      target.type = showing ? 'password' : 'text';
      btn.textContent = showing ? 'Show' : 'Hide';
    });
  });
}

/* ===================== INIT ===================== */
loadAuth();
renderHeader();
navigate();
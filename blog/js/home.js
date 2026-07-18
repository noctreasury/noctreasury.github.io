// Global variables
let allPostsMaster = [];    // Master copy of all posts
let allPostsDisplay = [];   // Current display posts (filtered or all)
let allComments = [];
let renderLimit = 6;
let swiperInstance = null;
let currentSearchTerm = '';

function extractFirstImage(html) {
    if (!html) return 'https://placehold.co/600x400/e2e8f0/64748b?text=Blog+Image';
    const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    return match ? match[1] : 'https://placehold.co/600x400/e2e8f0/64748b?text=Blog+Image';
}

function stripHtml(html) {
    let temp = document.createElement("div");
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || "";
}

// Navigate to post with URL parameter
function navigateToPost(postId) {
    window.location.href = `post.html?id=${postId}`;
}

// Navigate to category with URL parameter
function navigateToCategory(category) {
    window.location.href = `category.html?category=${encodeURIComponent(category)}`;
}

// Reveal content after full load
function revealContent() {
    document.body.classList.add('loaded');
    const loader = document.getElementById('pageLoader');
    if (loader) {
        loader.classList.add('hidden');
        setTimeout(() => {
            loader.style.display = 'none';
        }, 400);
    }
    // Update swiper after reveal for correct dimensions
    setTimeout(() => {
        if (swiperInstance && typeof swiperInstance.update === 'function') {
            swiperInstance.update();
        }
    }, 100);
}

// Search function
function performSearch(searchTerm) {
    currentSearchTerm = searchTerm.trim().toLowerCase();
    
    if (!currentSearchTerm) {
        allPostsDisplay = [...allPostsMaster];
        document.getElementById("searchResultsInfo").style.display = "none";
        renderFullPage();
    } else {
        const filtered = allPostsMaster.filter(post => {
            if (post.title && post.title.toLowerCase().includes(currentSearchTerm)) return true;
            if (post.category && post.category.toLowerCase().includes(currentSearchTerm)) return true;
            if (post.tags && post.tags.toLowerCase().includes(currentSearchTerm)) return true;
            if (post.author && post.author.toLowerCase().includes(currentSearchTerm)) return true;
            if (post.content && stripHtml(post.content).toLowerCase().includes(currentSearchTerm)) return true;
            return false;
        });
        
        allPostsDisplay = filtered;
        
        document.getElementById("searchResultsInfo").style.display = "block";
        document.getElementById("searchResultsInfo").innerHTML = `
            <div class="search-results-info">
                <div>
                    <i class="bi bi-search"></i> 
                    <strong>${filtered.length}</strong> result${filtered.length !== 1 ? 's' : ''} found for 
                    "<span class="search-highlight">${escapeHtml(currentSearchTerm)}</span>"
                </div>
                <button class="btn btn-sm btn-outline-custom" id="clearSearchBtn">
                    <i class="bi bi-x-lg"></i> Clear search
                </button>
            </div>
        `;
        
        document.getElementById("clearSearchBtn")?.addEventListener("click", () => {
            clearSearch();
        });
        
        renderSearchResults(filtered);
    }
}

function clearSearch() {
    const desktopInput = document.getElementById("desktopSearchInput");
    const mobileInput = document.getElementById("mobileSearchInput");
    if (desktopInput) desktopInput.value = '';
    if (mobileInput) mobileInput.value = '';
    
    currentSearchTerm = '';
    allPostsDisplay = [...allPostsMaster];
    document.getElementById("searchResultsInfo").style.display = "none";
    renderFullPage();
}

function renderSearchResults(posts) {
    if (posts.length === 0) {
        document.getElementById("heroPostContainer").style.display = "none";
        document.getElementById("relatedSection").style.display = "none";
        document.getElementById("sliderSection").style.display = "none";
        document.getElementById("remainingPostsSection").style.display = "block";
        document.getElementById("allPostsGrid").innerHTML = `
            <div class="no-results">
                <i class="bi bi-emoji-frown" style="font-size: 4rem; color: #cbd5e1;"></i>
                <h4 class="mt-3">No posts found</h4>
                <p class="text-muted">We couldn't find any posts matching "<strong>${escapeHtml(currentSearchTerm)}</strong>"</p>
                <button class="btn btn-primary-custom mt-2" id="clearSearchNoResultsBtn">
                    <i class="bi bi-arrow-counterclockwise"></i> Clear search
                </button>
            </div>
        `;
        document.getElementById("loadMoreTrigger").style.display = "none";
        document.getElementById("clearSearchNoResultsBtn")?.addEventListener("click", () => clearSearch());
        return;
    }
    
    document.getElementById("heroPostContainer").style.display = "none";
    document.getElementById("relatedSection").style.display = "none";
    document.getElementById("sliderSection").style.display = "none";
    document.getElementById("remainingPostsSection").style.display = "block";
    
    renderPostsGrid(posts, renderLimit);
    document.getElementById("loadMoreBtn").style.display = posts.length > renderLimit ? "inline-block" : "none";
    document.getElementById("loadMoreBtn").onclick = () => loadMoreSearchResults(posts);
}

function loadMoreSearchResults(posts) {
    renderLimit += 6;
    renderPostsGrid(posts, renderLimit);
    if (renderLimit >= posts.length) {
        document.getElementById("loadMoreBtn").style.display = "none";
        document.getElementById("noMoreMsg").classList.remove("d-none");
    }
}

function renderPostsGrid(posts, limit) {
    const postsToShow = posts.slice(0, limit);
    const container = document.getElementById("allPostsGrid");
    container.innerHTML = postsToShow.map(p => `
        <div class="col-md-4 col-lg-3">
            <div class="card-blog h-100 p-3 d-flex flex-column">
                <img src="${p.image}" class="card-img-top rounded-3" style="height:160px; object-fit:cover;" onerror="this.src='https://placehold.co/600x400/e2e8f0/64748b?text=No+Image'">
                <div class="card-body px-0 flex-grow-1">
                    <span class="category-badge" data-category="${escapeHtml(p.category)}">${escapeHtml(p.category)}</span>
                    <h6 class="fw-bold mt-2">${escapeHtml(p.title)}</h6>
                    <div class="small text-muted"><i class="bi bi-chat"></i> ${allComments.filter(c=>String(c.postId)===String(p.id)).length} comments</div>
                </div>
                <div><button class="btn btn-sm btn-primary-custom tile-read-btn" data-id="${p.id}">Read more →</button></div>
            </div>
        </div>
    `).join('');
    
    document.querySelectorAll(".tile-read-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const postId = btn.getAttribute("data-id");
            navigateToPost(postId);
        });
    });
    document.querySelectorAll(".category-badge").forEach(badge => {
        badge.addEventListener("click", (e) => {
            e.stopPropagation();
            const category = badge.getAttribute("data-category");
            navigateToCategory(category);
        });
    });
}

function renderFullPage() {
    renderLimit = 6;
    
    if (allPostsDisplay.length === 0) return;
    
    document.getElementById("heroPostContainer").style.display = "block";
    document.getElementById("remainingPostsSection").style.display = "block";
    document.getElementById("noMoreMsg").classList.add("d-none");
    
    const heroPost = allPostsDisplay[0];
    renderHero(heroPost);
    
    if (allPostsDisplay.length > 1) {
        renderRelatedPosts(heroPost.category, heroPost.id);
    } else {
        document.getElementById("relatedSection").style.display = "none";
    }
    
    const sliderPosts = allPostsDisplay.slice(1, 11);
    if (sliderPosts.length > 0) {
        initSwiperSlider(sliderPosts);
    } else {
        document.getElementById("sliderSection").style.display = "none";
    }
    
    const remainingPosts = allPostsDisplay.slice(1);
    if (remainingPosts.length > 0) {
        renderAllPostsTiles(remainingPosts, renderLimit);
        document.getElementById("loadMoreBtn").onclick = () => loadMorePosts(remainingPosts);
    } else {
        document.getElementById("allPostsGrid").innerHTML = '';
        document.getElementById("loadMoreTrigger").style.display = "none";
    }
}

function loadMorePosts(remainingPosts) {
    renderLimit += 6;
    renderAllPostsTiles(remainingPosts, renderLimit);
    if (renderLimit >= remainingPosts.length) {
        document.getElementById("loadMoreBtn").style.display = "none";
        document.getElementById("noMoreMsg").classList.remove("d-none");
    }
}

function renderAllPostsTiles(posts, limit) {
    let container = document.getElementById("allPostsGrid");
    let postsToShow = posts.slice(0, limit);
    container.innerHTML = postsToShow.map(p => `
        <div class="col-md-4 col-lg-3">
            <div class="card-blog h-100 p-3 d-flex flex-column">
                <img src="${p.image}" class="card-img-top rounded-3" style="height:160px; object-fit:cover;" onerror="this.src='https://placehold.co/600x400/e2e8f0/64748b?text=No+Image'">
                <div class="card-body px-0 flex-grow-1">
                    <span class="category-badge" data-category="${escapeHtml(p.category)}">${escapeHtml(p.category)}</span>
                    <h6 class="fw-bold mt-2">${escapeHtml(p.title)}</h6>
                    <div class="small text-muted"><i class="bi bi-chat"></i> ${allComments.filter(c=>String(c.postId)===String(p.id)).length} comments</div>
                </div>
                <div><button class="btn btn-sm btn-primary-custom tile-read-btn" data-id="${p.id}">Read more →</button></div>
            </div>
        </div>
    `).join('');
    
    document.querySelectorAll(".tile-read-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const postId = btn.getAttribute("data-id");
            navigateToPost(postId);
        });
    });
    document.querySelectorAll(".category-badge").forEach(badge => {
        badge.addEventListener("click", (e) => {
            e.stopPropagation();
            const category = badge.getAttribute("data-category");
            navigateToCategory(category);
        });
    });
    
    let loadBtn = document.getElementById("loadMoreBtn");
    if(limit >= posts.length) { 
        loadBtn.style.display = "none"; 
        document.getElementById("noMoreMsg").classList.remove("d-none"); 
    } else { 
        loadBtn.style.display = "inline-block"; 
        document.getElementById("noMoreMsg").classList.add("d-none"); 
    }
}

async function loadHeaderConfig() {
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/configure!A:F?key=${CONFIG.API_KEY}`;
        const resp = await fetch(url);
        const data = await resp.json();
        const rows = data.values || [];
        if(rows.length < 2) return;
        let blogTitle = "Blog Studio", logoUrl = "";
        let menuItems = [];
        for(let i=1; i<rows.length; i++) {
            let row = rows[i];
            let item = row[0]?.trim(), configVal = row[1]?.trim(), menu = row[2]?.trim(), sub = row[3]?.trim(), linkItem = row[4]?.trim(), link = row[5]?.trim();
            if(item === "Blog Title" && configVal) blogTitle = configVal;
            if(item === "Blog logo(url)" && configVal) logoUrl = configVal;
            if(menu && menu !== "Menu") {
                let existing = menuItems.find(m => m.name === menu);
                if(!existing) {
                    existing = { name: menu, subItems: [] };
                    menuItems.push(existing);
                }
                if(sub && sub !== "Sub Menu" && linkItem && link) {
                    existing.subItems.push({ label: sub, url: link });
                } else if (linkItem && link && (!sub || sub === "Sub Menu")) {
                    existing.subItems.push({ label: linkItem, url: link });
                }
            }
        }
        renderHeader(blogTitle, logoUrl, menuItems);
    } catch(e) { console.warn(e); renderHeader("Blog Studio", "", []); }
}

function renderHeader(title, logoUrl, menus) {
    let logoHtml = logoUrl ? `<img src="${logoUrl}" height="35" alt="logo">` : `<i class="bi bi-journal-bookmark-fill fs-3" style="color:#4f46e5"></i>`;
    let navHtml = `<nav class="navbar navbar-expand-lg bg-white border-bottom sticky-top px-3 px-md-5 py-2 shadow-sm">
        <div class="container-fluid">
            <a class="navbar-brand fw-bold" href="./index.html">${logoHtml} ${title}</a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#blogNavbar">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="blogNavbar">
                <ul class="navbar-nav ms-auto mb-2 mb-lg-0 gap-2 align-items-center">
                    <li class="nav-item desktop-search">
                        <div class="search-wrapper">
                            <i class="bi bi-search search-icon"></i>
                            <input type="text" id="desktopSearchInput" class="form-control search-input" placeholder="Search by title, category, tags..." style="width: 260px;">
                            <button class="clear-search" id="clearDesktopSearch">✕</button>
                        </div>
                    </li>`;
    
    menus.forEach(menu => {
        if(menu.subItems.length) {
            navHtml += `<li class="nav-item dropdown">
                <a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">${menu.name}</a>
                <ul class="dropdown-menu">`;
            menu.subItems.forEach(sub => { navHtml += `<li><a class="dropdown-item" href="${sub.url}">${sub.label}</a></li>`; });
            navHtml += `</ul></li>`;
        } else {
            navHtml += `<li class="nav-item"><a class="nav-link" href="#">${menu.name}</a></li>`;
        }
    });
    
    navHtml += `<li class="nav-item mobile-search-btn">
                        <button class="btn btn-outline-secondary rounded-circle" id="openMobileSearch" style="width: 40px; height: 40px;">
                            <i class="bi bi-search"></i>
                        </button>
                    </li>
                </ul>
            </div>
        </div>
    </nav>`;
    
    document.getElementById('main-header').innerHTML = navHtml;
    
    setTimeout(() => {
        const desktopInput = document.getElementById("desktopSearchInput");
        const clearDesktopBtn = document.getElementById("clearDesktopSearch");
        const openMobileBtn = document.getElementById("openMobileSearch");
        const closeMobileBtn = document.getElementById("closeMobileSearch");
        const mobileInput = document.getElementById("mobileSearchInput");
        const mobileModal = document.getElementById("mobileSearchModal");
        
        if (desktopInput) {
            desktopInput.addEventListener("input", (e) => {
                const val = e.target.value;
                if (clearDesktopBtn) {
                    clearDesktopBtn.style.display = val ? "block" : "none";
                }
                performSearch(val);
            });
        }
        
        if (clearDesktopBtn) {
            clearDesktopBtn.addEventListener("click", () => {
                if (desktopInput) desktopInput.value = "";
                clearDesktopBtn.style.display = "none";
                clearSearch();
            });
        }
        
        if (openMobileBtn) {
            openMobileBtn.addEventListener("click", () => {
                mobileModal.classList.add("active");
                if (mobileInput) mobileInput.focus();
            });
        }
        
        if (closeMobileBtn) {
            closeMobileBtn.addEventListener("click", () => {
                mobileModal.classList.remove("active");
            });
        }
        
        if (mobileInput) {
            mobileInput.addEventListener("input", (e) => {
                performSearch(e.target.value);
                if (desktopInput && desktopInput.value !== e.target.value) {
                    desktopInput.value = e.target.value;
                    if (clearDesktopBtn) {
                        clearDesktopBtn.style.display = e.target.value ? "block" : "none";
                    }
                }
            });
        }
        
        if (mobileModal) {
            mobileModal.addEventListener("click", (e) => {
                if (e.target === mobileModal) {
                    mobileModal.classList.remove("active");
                }
            });
        }
    }, 100);
}

async function fetchBlogData() {
    const blogUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/blog%20data!A:I?key=${CONFIG.API_KEY}`;
    const commentsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/Comments%20data!A:D?key=${CONFIG.API_KEY}`;
    const [blogRes, commRes] = await Promise.all([fetch(blogUrl), fetch(commentsUrl)]);
    const blogJson = await blogRes.json();
    const commJson = await commRes.json();
    const rows = blogJson.values || [];
    if(rows.length < 2) throw new Error("No blog data found");
    const posts = [];
    for(let i=1; i<rows.length; i++) {
        let row = rows[i];
        if(row[0]) {
            let post = {
                id: row[0],
                category: row[1] || "General",
                tags: row[2] || "",
                author: row[3] || "Admin",
                publishedTime: row[4] || new Date().toISOString(),
                title: row[5] || "Untitled",
                content: row[6] || "",
                likeCount: parseInt(row[7]) || 0,
                shareCount: parseInt(row[8]) || 0,
                image: extractFirstImage(row[6] || "")
            };
            posts.push(post);
        }
    }
    posts.sort((a,b) => parseInt(b.id) - parseInt(a.id));
    const commentRows = commJson.values || [];
    let comments = [];
    for(let i=1; i<commentRows.length; i++) {
        let r = commentRows[i];
        comments.push({ postId: r[0], user: r[1] || "Anonymous", date: r[2] || "", text: r[3] || "" });
    }
    return { posts, comments };
}

function renderHero(post) {
    if(!post) return;
    let excerpt = stripHtml(post.content).substring(0,150);
    document.getElementById("heroPostContainer").innerHTML = `
        <div class="hero-card row g-0 align-items-stretch shadow-sm border rounded-4 overflow-hidden bg-white">
            <div class="col-md-6 hero-image-col p-0">
                <img src="${post.image}" class="hero-image w-100 h-100 object-fit-cover" style="min-height:280px; max-height:100%; object-fit:cover;" alt="hero" onerror="this.src='https://placehold.co/600x400/e2e8f0/64748b?text=Hero+Image'">
            </div>
            <div class="col-md-6 hero-content-col d-flex flex-column justify-content-center p-4 p-md-5">
                <span class="category-badge w-auto mb-3" data-category="${escapeHtml(post.category)}">${escapeHtml(post.category)}</span>
                <h2 class="hero-title fw-bold mb-3">${escapeHtml(post.title)}</h2>
                <div class="hero-meta mb-3">
                    <span><i class="bi bi-person-circle"></i> ${escapeHtml(post.author)}</span>
                    <span><i class="bi bi-calendar"></i> ${escapeHtml(post.publishedTime)}</span>
                </div>
                <p class="hero-excerpt text-secondary mb-4">${escapeHtml(excerpt)}...</p>
                <button class="btn-read-article hero-read-btn" data-id="${post.id}">
                    Read full article <i class="bi bi-arrow-right"></i>
                </button>
            </div>
        </div>`;
    
    document.querySelector('.hero-read-btn')?.addEventListener('click', (e) => {
        const postId = e.currentTarget.getAttribute('data-id');
        navigateToPost(postId);
    });
    document.querySelector('.category-badge')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const category = e.currentTarget.getAttribute('data-category');
        navigateToCategory(category);
    });
}

function renderRelatedPosts(category, excludeId) {
    let related = allPostsDisplay.filter(p => p.category === category && String(p.id) !== String(excludeId)).slice(0,3);
    let container = document.getElementById("relatedGrid");
    if(related.length === 0) { 
        document.getElementById("relatedSection").style.display = "none"; 
        return; 
    }
    document.getElementById("relatedSection").style.display = "block";
    document.getElementById("relatedCategoryName").innerText = category;
    container.innerHTML = related.map(p => `
        <div class="col-md-4">
            <div class="card-blog h-100 p-3">
                <img src="${p.image}" class="card-img-top rounded-3" style="height:160px; object-fit:cover;" onerror="this.src='https://placehold.co/600x400/e2e8f0/64748b?text=No+Image'">
                <div class="card-body px-0">
                    <span class="category-badge" data-category="${escapeHtml(p.category)}">${escapeHtml(p.category)}</span>
                    <h5 class="card-title mt-2">${escapeHtml(p.title)}</h5>
                    <div class="small text-muted">${escapeHtml(p.author)} · ${escapeHtml(p.publishedTime)}</div>
                    <button class="btn btn-sm btn-outline-custom mt-2 related-read-btn" data-id="${p.id}">Read more →</button>
                </div>
            </div>
        </div>
    `).join('');
    
    document.querySelectorAll(".related-read-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const postId = btn.getAttribute("data-id");
            navigateToPost(postId);
        });
    });
    document.querySelectorAll(".category-badge").forEach(badge => {
        badge.addEventListener("click", (e) => {
            e.stopPropagation();
            const category = badge.getAttribute("data-category");
            navigateToCategory(category);
        });
    });
}

function initSwiperSlider(postsToSlide) {
    if(postsToSlide.length === 0) { 
        document.getElementById("sliderSection").style.display = "none"; 
        return; 
    }
    document.getElementById("sliderSection").style.display = "block";
    let wrapper = document.getElementById("swiperWrapper");
    wrapper.innerHTML = postsToSlide.map(p => `
        <div class="swiper-slide h-auto">
            <div class="card-blog h-100 p-3">
                <img src="${p.image}" class="card-img-top rounded-3" style="height:150px; object-fit:cover;" onerror="this.src='https://placehold.co/600x400/e2e8f0/64748b?text=No+Image'">
                <div class="card-body px-0">
                    <span class="category-badge" data-category="${escapeHtml(p.category)}">${escapeHtml(p.category)}</span>
                    <h6 class="fw-bold mt-2">${escapeHtml(p.title.substring(0,55))}</h6>
                    <button class="btn btn-sm btn-link text-decoration-none slide-read-btn p-0 mt-2" data-id="${p.id}">Read more →</button>
                </div>
            </div>
        </div>
    `).join('');
    
    if(swiperInstance) swiperInstance.destroy(true,true);
    swiperInstance = new Swiper(".mySwiper", { 
        slidesPerView: 1.2, 
        spaceBetween: 16, 
        breakpoints: { 
            640: { slidesPerView: 2 }, 
            1024: { slidesPerView: 3.5 } 
        } 
    });
    
    document.querySelectorAll(".slide-read-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const postId = btn.getAttribute("data-id");
            navigateToPost(postId);
        });
    });
    document.querySelectorAll(".category-badge").forEach(badge => {
        badge.addEventListener("click", (e) => {
            e.stopPropagation();
            const category = badge.getAttribute("data-category");
            navigateToCategory(category);
        });
    });
    
    document.getElementById("prevSlide").onclick = () => swiperInstance.slidePrev();
    document.getElementById("nextSlide").onclick = () => swiperInstance.slideNext();
}

function escapeHtml(str) { 
    if(!str) return ''; 
    return str.replace(/[&<>]/g, function(m){ 
        if(m==='&') return '&amp;'; 
        if(m==='<') return '&lt;'; 
        if(m==='>') return '&gt;'; 
        return m;
    });
}

async function initHome() {
    document.getElementById("heroPostContainer").innerHTML = `<div class="text-center p-5"><div class="spinner-border text-primary"></div><p class="mt-2">Loading posts...</p></div>`;
    await loadHeaderConfig();
    
    try {
        const { posts, comments } = await fetchBlogData();
        allPostsMaster = [...posts];
        allPostsDisplay = [...posts];
        allComments = comments;
        
        if(allPostsMaster.length === 0) {
            document.getElementById("heroPostContainer").innerHTML = `<div class="alert alert-warning">No posts found. Please add some posts to get started!</div>`;
            revealContent();
            return;
        }
        
        renderFullPage();
        // Reveal all sections after rendering is complete
        revealContent();
    } catch(error) {
        console.error("Init error:", error);
        document.getElementById("heroPostContainer").innerHTML = `<div class="alert alert-danger">Error loading posts: ${error.message}</div>`;
        revealContent();
    }
}

// Initialize the blog
initHome();
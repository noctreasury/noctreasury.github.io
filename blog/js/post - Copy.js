// ======================== TEXT TO SPEECH (TTS) FUNCTIONALITY ========================
let speechSynthesis = window.speechSynthesis;
let currentUtterance = null;
let isPlaying = false;
let currentSpeed = 1.15;
let currentVoice = null;
let currentStartTime = 0;
let currentDuration = 0;
let progressInterval = null;
let ttsText = '';
let ttsSentences = [];
let currentSentenceIndex = 0;
let availableVoices = [];
let currentHighlightElement = null;
let autoScrollEnabled = true;
let lastUserScrollTime = 0;

// ======================== CORE FUNCTIONS ========================
let currentPost = null;
let allComments = [];
let commenterName = localStorage.getItem('commenterName') || '';
let currentPostId = null;
let isLikePending = false;
let isCommentPending = false;
let allPostsMaster = [];
let relatedSwiper = null;

// Get text to read (title + author details + content without HTML) with sentence splitting
function getTTSContent() {
    const titleElement = document.querySelector('.blog-title');
    const contentElement = document.querySelector('.blog-content');
    
    // Get author details - try multiple selectors to ensure we find them
    let authorName = '';
    let authorDesignation = '';
    let publishedDate = '';
    
    // Try to get author name from author-link element
    const authorLinkElement = document.querySelector('.author-link[data-author]');
    if (authorLinkElement) {
        authorName = authorLinkElement.getAttribute('data-author') || authorLinkElement.innerText.trim();
    } else {
        // Fallback: try to find by class
        const authorElement = document.querySelector('.author-link');
        if (authorElement) {
            authorName = authorElement.innerText.trim();
        }
    }
    
    // Try to get designation
    const designationElement = document.querySelector('.author-link + div .small.text-muted, .author-link ~ div .small.text-muted, [data-designation]');
    if (designationElement) {
        authorDesignation = designationElement.getAttribute('data-designation') || designationElement.innerText.trim();
    }
    
    // Try to get published date
    const dateElement = document.querySelector('.blog-meta span i.bi-calendar3')?.parentElement;
    if (dateElement) {
        publishedDate = dateElement.innerText.trim();
    } else {
        // Fallback: try to get from blog-meta
        const metaSpans = document.querySelectorAll('.blog-meta span');
        for (let span of metaSpans) {
            if (span.innerHTML.includes('bi-calendar3')) {
                publishedDate = span.innerText.trim();
                break;
            }
        }
    }
    
    // If still no date, try to get from currentPost object
    if (!publishedDate && currentPost && currentPost.publishedTime) {
        publishedDate = currentPost.publishedTime;
    }
    
    let text = '';
    
    // Add title
    if (titleElement) {
        text += titleElement.innerText.trim() + '. ';
    }
    
    // Add author details and published date with natural phrasing
    let authorText = '';
    if (authorName && authorName !== 'Anonymous') {
        authorText = `Written by ${authorName}. `;
        
        // Add designation if available
        if (authorDesignation && authorDesignation.trim()) {
            authorText += ` :: ${authorDesignation}. `;
        }
    } else if (authorName === 'Anonymous') {
        // Skip saying "Posted by Anonymous" as it sounds odd
        // Just add a short pause
        authorText = '';
    }
    
    // Add published date
    if (publishedDate && publishedDate.trim()) {
        if (authorText) {
            authorText += `Published on ${publishedDate}. `;
        } else {
            authorText = `This article was published on ${publishedDate}. `;
        }
    }
    
    // If we have author text, add it after title with a natural flow
    if (authorText) {
        text += authorText;
    }
    
    // Add a brief pause before content (using a short sentence)
    text += ' "".."".. ';
    
    // Add main content
    if (contentElement) {
        text += contentElement.innerText.trim();
    }
    
    // Clean up extra spaces
    text = text.replace(/\s+/g, ' ').trim();
    
    console.log('TTS Text generated:', text.substring(0, 200) + '...'); // Debug log
    
    // Split into sentences for highlighting
    ttsSentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    ttsSentences = ttsSentences.map(s => s.trim()).filter(s => s.length > 0);
    
    return text;
}

// Refresh TTS content when needed (call after DOM is fully ready)
function refreshTTSContent() {
    ttsText = getTTSContent();
    updateTTSDuration();
    
    // If currently playing, restart with new content
    if (isPlaying) {
        const wasPlaying = isPlaying;
        const progressBar = document.getElementById('ttsProgressBar');
        const currentProgress = progressBar ? parseFloat(progressBar.value) : 0;
        stopTTSPlayback();
        startTTSPlayback();
        setTimeout(() => {
            if (progressBar && currentDuration) {
                progressBar.value = currentProgress;
            }
        }, 100);
    }
}

// Highlight current sentence being read
function highlightCurrentSentence(index) {
    const contentElement = document.querySelector('.blog-content');
    if (!contentElement) return;
    
    // Remove all existing highlights
    document.querySelectorAll('.tts-sentence-highlight').forEach(el => {
        el.classList.remove('tts-sentence-highlight');
    });
    
    if (index >= ttsSentences.length) return;
    
    const sentenceToFind = ttsSentences[index];
    if (!sentenceToFind) return;
    
    // For author details (which are not in the content), we don't highlight anything
    if (sentenceToFind.includes('Posted by') || sentenceToFind.includes('Published on') || sentenceToFind.includes('Now reading the article')) {
        // Skip highlighting for non-content sentences
        return;
    }
    
    const searchText = sentenceToFind.substring(0, 50).trim();
    const paragraphs = contentElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, div:not(.action-bar)');
    
    for (let para of paragraphs) {
        const paraText = para.innerText;
        if (paraText.includes(searchText.substring(0, 30))) {
            para.classList.add('tts-sentence-highlight');
            currentHighlightElement = para;
            
            const now = Date.now();
            if (autoScrollEnabled && (now - lastUserScrollTime) > 2000) {
                para.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            break;
        }
    }
}

// Get character index at sentence boundary
function getSentenceBoundary(charIndex) {
    let charCount = 0;
    for (let i = 0; i < ttsSentences.length; i++) {
        charCount += ttsSentences[i].length;
        if (charIndex <= charCount) {
            return i;
        }
    }
    return 0;
}

// Get available voices and populate dropdown
function loadVoices() {
    return new Promise((resolve) => {
        const voices = speechSynthesis.getVoices();
        if (voices.length) {
            populateVoiceList(voices);
            resolve();
        } else {
            speechSynthesis.onvoiceschanged = () => {
                const newVoices = speechSynthesis.getVoices();
                populateVoiceList(newVoices);
                resolve();
            };
        }
    });
}

function populateVoiceList(voices) {
    availableVoices = voices;
    const voiceSelect = document.getElementById('voiceSelect');
    if (!voiceSelect) return;
    
    voiceSelect.innerHTML = '<option value="">Select Voice</option>';
    
    // Filter English voices and sort by name
    const englishVoices = voices.filter(voice => voice.lang.startsWith('en'));
    
    englishVoices.forEach((voice, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${voice.name} (${voice.lang})`;
        if (currentVoice && currentVoice.name === voice.name) {
            option.selected = true;
        }
        voiceSelect.appendChild(option);
    });
    
    // Set default voice if none selected
    if (!currentVoice && englishVoices.length > 0) {
        currentVoice = englishVoices[0];
        if (voiceSelect) voiceSelect.value = 0;
    }
}

function setVoice(voiceIndex) {
    if (availableVoices[voiceIndex]) {
        currentVoice = availableVoices[voiceIndex];
        localStorage.setItem('ttsVoiceIndex', voiceIndex);
        localStorage.setItem('ttsVoiceName', currentVoice.name);
        
        // If currently playing, restart with new voice
        if (isPlaying) {
            stopTTSPlayback();
            startTTSPlayback();
        }
    }
}

function loadVoicePreference() {
    const savedVoiceIndex = localStorage.getItem('ttsVoiceIndex');
    const savedVoiceName = localStorage.getItem('ttsVoiceName');
    
    if (savedVoiceIndex && availableVoices[savedVoiceIndex]) {
        currentVoice = availableVoices[savedVoiceIndex];
        const voiceSelect = document.getElementById('voiceSelect');
        if (voiceSelect) voiceSelect.value = savedVoiceIndex;
    } else if (savedVoiceName) {
        const voice = availableVoices.find(v => v.name === savedVoiceName);
        if (voice) {
            currentVoice = voice;
            const voiceIndex = availableVoices.indexOf(voice);
            const voiceSelect = document.getElementById('voiceSelect');
            if (voiceSelect) voiceSelect.value = voiceIndex;
        }
    }
}

// Speed presets
const speedPresets = [
    { value: 0.75, label: '0.75x (Slow)' },
    { value: 1.0, label: '1x (Normal)' },
    { value: 1.15, label: '1.15x (Default)' },
    { value: 1.5, label: '1.5x' },
    { value: 2.0, label: '2x' },
    { value: 2.5, label: '2.5x (Fast)' }
];

function setSpeed(speedValue) {
    currentSpeed = parseFloat(speedValue);
    if (currentUtterance) {
        currentUtterance.rate = currentSpeed;
    }
    localStorage.setItem('ttsSpeed', currentSpeed);
    updateTTSDuration();
}

function initTTSWidget() {
    const blogContentWrapper = document.querySelector('.blog-content-wrapper');
    if (!blogContentWrapper) return;
    if (document.querySelector('.tts-widget')) return;
    
    // Simplified widget - only play button, progress bar, time, and settings button
    const ttsWidgetHtml = `
        <div class="tts-widget">
            <div class="tts-controls">
                <button class="tts-play-btn" id="ttsPlayBtn" title="Play/Pause">
                    <i class="bi bi-play-fill"></i>
                </button>
                <div class="tts-progress-container">
                    <input type="range" class="tts-progress-bar" id="ttsProgressBar" value="0" min="0" max="100" step="0.1">
                </div>
                <div class="tts-time">
                    <span id="ttsCurrentTime">0:00</span> / <span id="ttsDuration">0:00</span>
                </div>
                <button class="tts-settings-btn" id="ttsSettingsBtn" title="Settings">
                    <i class="bi bi-gear-fill"></i>
                </button>
            </div>
        </div>
    `;
    
    blogContentWrapper.insertAdjacentHTML('beforebegin', ttsWidgetHtml);
    initTTSSettingsModal();
    
    const playBtn = document.getElementById('ttsPlayBtn');
    const progressBar = document.getElementById('ttsProgressBar');
    const settingsBtn = document.getElementById('ttsSettingsBtn');
    
    if (playBtn) {
        playBtn.addEventListener('click', toggleTTSPlayback);
    }
    if (progressBar) {
        progressBar.addEventListener('input', seekTTS);
    }
    if (settingsBtn) {
        settingsBtn.addEventListener('click', openTTSSettings);
    }
    
    // Initial TTS content fetch
    ttsText = getTTSContent();
    updateTTSDuration();
    
    // Set up a MutationObserver to watch for DOM changes and refresh TTS content
    // This ensures author details are captured if they load after initial render
    setTimeout(() => {
        refreshTTSContent();
    }, 500);
}

function initTTSSettingsModal() {
    if (document.getElementById('ttsSettingsModal')) return;
    
    const modalHtml = `
        <div id="ttsSettingsModal" class="tts-settings-modal">
            <div class="tts-settings-card">
                <div class="tts-settings-header">
                    <h5><i class="bi bi-gear-fill"></i> TTS Settings</h5>
                    <button class="tts-settings-close" onclick="closeTTSSettings()">&times;</button>
                </div>
                <div class="tts-settings-body">
                    <!-- Voice Selection -->
                    <div class="tts-setting-group">
                        <label><i class="bi bi-mic"></i> Voice Selection</label>
                        <select id="voiceSelect" class="tts-select-full">
                            <option value="">Loading voices...</option>
                        </select>
                    </div>
                    
                    <!-- Speed Control -->
                    <div class="tts-setting-group">
                        <label><i class="bi bi-speedometer2"></i> Reading Speed</label>
                        <div class="speed-control">
                            <span class="speed-value" id="speedValue">${currentSpeed}x</span>
                            <input type="range" id="speedSlider" class="speed-slider" min="0.75" max="2.5" step="0.05" value="${currentSpeed}">
                        </div>
                        <div class="speed-presets" id="speedPresets">
                            <button class="speed-preset-btn" data-speed="0.75">0.75x</button>
                            <button class="speed-preset-btn" data-speed="1.0">1x</button>
                            <button class="speed-preset-btn" data-speed="1.15">1.15x</button>
                            <button class="speed-preset-btn" data-speed="1.5">1.5x</button>
                            <button class="speed-preset-btn" data-speed="2.0">2x</button>
                            <button class="speed-preset-btn" data-speed="2.5">2.5x</button>
                        </div>
                    </div>
                    
                    <!-- Auto-scroll Toggle -->
                    <div class="tts-setting-group">
                        <div class="form-switch">
                            <input class="form-check-input" type="checkbox" id="autoScrollToggle" checked>
                            <label class="form-check-label" for="autoScrollToggle">
                                <i class="bi bi-arrow-down-circle"></i> Auto-scroll while reading
                            </label>
                        </div>
                        <small class="text-muted d-block mt-2">When enabled, page scrolls automatically. Scroll manually to pause auto-scroll temporarily.</small>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Voice selection event listener
    const voiceSelect = document.getElementById('voiceSelect');
    if (voiceSelect) {
        voiceSelect.addEventListener('change', function() {
            if (this.value !== '') {
                setVoice(parseInt(this.value));
            }
        });
    }
    
    // Speed slider event listener
    const speedSlider = document.getElementById('speedSlider');
    const speedValue = document.getElementById('speedValue');
    
    if (speedSlider) {
        speedSlider.addEventListener('input', function() {
            const speed = parseFloat(this.value);
            if (speedValue) speedValue.textContent = speed + 'x';
            setSpeed(speed);
            updateActiveSpeedPreset(speed);
        });
    }
    
    // Speed preset buttons
    const presetBtns = document.querySelectorAll('.speed-preset-btn');
    presetBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const speed = parseFloat(this.dataset.speed);
            if (speedSlider) speedSlider.value = speed;
            if (speedValue) speedValue.textContent = speed + 'x';
            setSpeed(speed);
            updateActiveSpeedPreset(speed);
        });
    });
    
    // Auto-scroll toggle
    const autoScrollToggle = document.getElementById('autoScrollToggle');
    if (autoScrollToggle) {
        autoScrollToggle.addEventListener('change', function() {
            autoScrollEnabled = this.checked;
            localStorage.setItem('ttsAutoScroll', autoScrollEnabled);
        });
    }
    
    // Load saved preferences
    loadVoicePreference();
    
    const savedAutoScroll = localStorage.getItem('ttsAutoScroll');
    if (savedAutoScroll !== null) {
        autoScrollEnabled = savedAutoScroll === 'true';
        if (autoScrollToggle) autoScrollToggle.checked = autoScrollEnabled;
    }
    
    // Set active speed preset
    updateActiveSpeedPreset(currentSpeed);
    
    // Populate voices after they're loaded
    setTimeout(() => {
        if (availableVoices.length > 0) {
            populateVoiceList(availableVoices);
        }
    }, 100);
}

function updateActiveSpeedPreset(speed) {
    const presetBtns = document.querySelectorAll('.speed-preset-btn');
    presetBtns.forEach(btn => {
        const btnSpeed = parseFloat(btn.dataset.speed);
        if (Math.abs(btnSpeed - speed) < 0.01) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function openTTSSettings() {
    const modal = document.getElementById('ttsSettingsModal');
    if (modal) modal.classList.add('active');
}

function closeTTSSettings() {
    const modal = document.getElementById('ttsSettingsModal');
    if (modal) modal.classList.remove('active');
}

function updateTTSDuration() {
    const wordCount = ttsText.split(/\s+/).length;
    const estimatedSeconds = (wordCount / 150) * (1.15 / currentSpeed) * 60;
    currentDuration = Math.max(estimatedSeconds, 1);
    
    const durationMinutes = Math.floor(currentDuration / 60);
    const durationSeconds = Math.floor(currentDuration % 60);
    const durationDisplay = document.getElementById('ttsDuration');
    if (durationDisplay) {
        durationDisplay.textContent = `${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}`;
    }
}

function updateTTSProgress() {
    if (!isPlaying || !currentStartTime) return;
    
    const elapsed = (Date.now() - currentStartTime) / 1000;
    const progressPercent = (elapsed / currentDuration) * 100;
    
    const progressBar = document.getElementById('ttsProgressBar');
    const currentTimeSpan = document.getElementById('ttsCurrentTime');
    
    if (progressBar) progressBar.value = Math.min(progressPercent, 100);
    if (currentTimeSpan) {
        const elapsedMinutes = Math.floor(elapsed / 60);
        const elapsedSeconds = Math.floor(elapsed % 60);
        currentTimeSpan.textContent = `${elapsedMinutes}:${elapsedSeconds.toString().padStart(2, '0')}`;
    }
    
    if (elapsed >= currentDuration) {
        stopTTSPlayback();
        showToastMessage('📖 Finished reading article');
        if (currentHighlightElement) {
            currentHighlightElement.classList.remove('tts-sentence-highlight');
            currentHighlightElement = null;
        }
    }
}

function toggleTTSPlayback() {
    if (isPlaying) {
        pauseTTSPlayback();
    } else {
        startTTSPlayback();
    }
}

function startTTSPlayback() {
    // Refresh content before starting to ensure latest author details
    refreshTTSContent();
    
    if (!ttsText || ttsText.trim().length === 0) {
        showToastMessage('No content to read', true);
        return;
    }
    
    // Stop any ongoing speech
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }
    
    // Clear any pending progress interval
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
    
    currentSentenceIndex = -1;
    if (currentHighlightElement) {
        currentHighlightElement.classList.remove('tts-sentence-highlight');
        currentHighlightElement = null;
    }
    
    currentUtterance = new SpeechSynthesisUtterance(ttsText);
    currentUtterance.rate = currentSpeed;
    currentUtterance.pitch = 1.0;
    currentUtterance.volume = 1.0;
    
    if (currentVoice) {
        currentUtterance.voice = currentVoice;
    }
    
    currentUtterance.onstart = () => {
        isPlaying = true;
        currentStartTime = Date.now();
        const playBtn = document.getElementById('ttsPlayBtn');
        if (playBtn) playBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';
        progressInterval = setInterval(updateTTSProgress, 100);
    };
    
    currentUtterance.onboundary = (event) => {
        if (event.name === 'sentence' || event.name === 'word') {
            const sentenceIndex = getSentenceBoundary(event.charIndex);
            if (sentenceIndex !== currentSentenceIndex) {
                currentSentenceIndex = sentenceIndex;
                highlightCurrentSentence(currentSentenceIndex);
            }
        }
    };
    
    currentUtterance.onend = () => {
        stopTTSPlayback();
        if (currentHighlightElement) {
            currentHighlightElement.classList.remove('tts-sentence-highlight');
            currentHighlightElement = null;
        }
        showToastMessage('📖 Finished reading article');
    };
    
    currentUtterance.onerror = (event) => {
        console.error('TTS Error:', event);
        stopTTSPlayback();
        showToastMessage('Speech synthesis error', true);
    };
    
    speechSynthesis.speak(currentUtterance);
}

function pauseTTSPlayback() {
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }
    isPlaying = false;
    const playBtn = document.getElementById('ttsPlayBtn');
    if (playBtn) playBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
}

function stopTTSPlayback() {
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }
    isPlaying = false;
    const playBtn = document.getElementById('ttsPlayBtn');
    if (playBtn) playBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
    const progressBar = document.getElementById('ttsProgressBar');
    if (progressBar) progressBar.value = 0;
    const currentTimeSpan = document.getElementById('ttsCurrentTime');
    if (currentTimeSpan) currentTimeSpan.textContent = '0:00';
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
    currentStartTime = 0;
    currentSentenceIndex = -1;
}

function seekTTS(event) {
    const progressPercent = parseFloat(event.target.value);
    if (isPlaying) {
        stopTTSPlayback();
        startTTSPlayback();
    }
}

function loadTTSPreferences() {
    const savedSpeed = localStorage.getItem('ttsSpeed');
    if (savedSpeed) {
        currentSpeed = parseFloat(savedSpeed);
    }
}

function setupScrollTracking() {
    const contentElement = document.querySelector('.blog-content');
    if (contentElement) {
        contentElement.addEventListener('wheel', () => { lastUserScrollTime = Date.now(); });
        contentElement.addEventListener('touchmove', () => { lastUserScrollTime = Date.now(); });
        contentElement.addEventListener('scroll', () => { lastUserScrollTime = Date.now(); });
    }
    window.addEventListener('wheel', () => { lastUserScrollTime = Date.now(); });
    window.addEventListener('touchmove', () => { lastUserScrollTime = Date.now(); });
}

// Stop TTS when page is unloaded (closed, refreshed, or navigated away)
function setupPageUnloadHandler() {
    window.addEventListener('beforeunload', () => {
        if (speechSynthesis.speaking) {
            speechSynthesis.cancel();
        }
    });
    
    // Also handle page visibility change (tab switch)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && speechSynthesis.speaking) {
            speechSynthesis.cancel();
            isPlaying = false;
            const playBtn = document.getElementById('ttsPlayBtn');
            if (playBtn) playBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
            if (progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
            }
        }
    });
}

// ======================== UTILITY FUNCTIONS ========================
function showToastMessage(msg, isError = false) {
    const toastEl = document.getElementById('liveToast');
    const span = document.getElementById('toastMsg');
    if (!toastEl || !span) return;
    span.innerText = msg;
    toastEl.style.background = isError ? '#d32f2f' : '#1f1f1f';
    toastEl.style.opacity = '1';
    setTimeout(() => { toastEl.style.opacity = '0'; }, 2500);
}

function getCurrentPageUrl(postId) {
    const baseUrl = window.location.href.split('?')[0];
    return `${baseUrl}?id=${postId}`;
}

function updateBrowserUrl(postId) {
    const newUrl = getCurrentPageUrl(postId);
    window.history.pushState({ postId: postId }, '', newUrl);
}

function getPostIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlId = urlParams.get('id');
    if (urlId && !isNaN(parseInt(urlId))) {
        return urlId;
    }
    return null;
}

function navigateToCategory(category) {
    window.location.href = `category.html?category=${encodeURIComponent(category)}`;
}

function navigateToAuthor(authorName, authorDesignation) {
    let url = `profile.html?author=${encodeURIComponent(authorName)}`;
    if (authorDesignation && authorDesignation.trim()) {
        url += `&designation=${encodeURIComponent(authorDesignation)}`;
    }
    window.location.href = url;
}

function navigateToPost(postId) {
    window.location.href = `post.html?id=${postId}`;
}

function navigateToHome() {
    window.location.href = 'index.html';
}

function extractFirstImage(html) {
    if (!html) return null;
    const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    return match ? match[1] : null;
}

function stripHtml(html) {
    let temp = document.createElement("div");
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || "";
}

function updateSocialMetaTags(post) {
    const shareUrl = getCurrentPageUrl(post.id);
    const featuredImg = extractFirstImage(post.content);
    const description = stripHtml(post.content).substring(0, 200) + '...';
    
    let ogTitle = document.querySelector('meta[property="og:title"]');
    let ogDescription = document.querySelector('meta[property="og:description"]');
    let ogImage = document.querySelector('meta[property="og:image"]');
    let ogUrl = document.querySelector('meta[property="og:url"]');
    let twitterTitle = document.querySelector('meta[name="twitter:title"]');
    let twitterDescription = document.querySelector('meta[name="twitter:description"]');
    let twitterImage = document.querySelector('meta[name="twitter:image"]');
    
    if (ogTitle) ogTitle.setAttribute('content', post.title + ' | NOC Blog');
    if (ogDescription) ogDescription.setAttribute('content', description);
    if (ogImage && featuredImg) ogImage.setAttribute('content', featuredImg);
    if (ogUrl) ogUrl.setAttribute('content', shareUrl);
    if (twitterTitle) twitterTitle.setAttribute('content', post.title + ' | NOC Blog');
    if (twitterDescription) twitterDescription.setAttribute('content', description);
    if (twitterImage && featuredImg) twitterImage.setAttribute('content', featuredImg);
    
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
        metaDescription = document.createElement('meta');
        metaDescription.setAttribute('name', 'description');
        document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute('content', description);
    document.title = `${post.title} | NOC Blog`;
}

async function fetchAllPosts() {
    const blogUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/blog%20data!A:I?key=${CONFIG.API_KEY}`;
    const response = await fetch(blogUrl);
    const data = await response.json();
    const rows = data.values || [];
    if(rows.length < 2) return [];
    
    const posts = [];
    for(let i=1; i<rows.length; i++) {
        let row = rows[i];
        if(row[0]) {
            posts.push({
                id: row[0],
                category: row[1] || "General",
                tags: row[2] || "",
                author: row[3] || "Anonymous",
                publishedTime: row[4] || "",
                title: row[5] || "Untitled",
                content: row[6] || "",
                likeCount: parseInt(row[7]) || 0,
                shareCount: parseInt(row[8]) || 0,
                image: extractFirstImage(row[6] || "")
            });
        }
    }
    return posts;
}

function renderRelatedPostsSlider(currentPostId, currentCategory) {
    const container = document.getElementById('relatedPostsSliderContainer');
    if (!container) return;
    
    let relatedPosts = allPostsMaster.filter(p => 
        p.category === currentCategory && String(p.id) !== String(currentPostId)
    ).slice(0, 10);
    
    if (relatedPosts.length === 0) {
        container.style.display = 'none';
        const backButtonContainer = document.getElementById('backToHomeContainer');
        if (backButtonContainer) backButtonContainer.style.display = 'none';
        return;
    }
    
    const wrapper = document.getElementById('relatedSliderWrapper');
    if (!wrapper) return;
    
    wrapper.innerHTML = relatedPosts.map(post => `
        <div class="swiper-slide h-auto">
            <div class="card-blog h-100 p-3">
                <img src="${post.image}" class="card-img-top rounded-3" 
                     style="height:160px; object-fit:cover;" 
                     onerror="this.src='https://placehold.co/600x400/e2e8f0/64748b?text=No+Image'"
                     loading="lazy">
                <div class="card-body px-0 pt-3">
                    <span class="category-badge related-category-badge" data-category="${escapeHtml(post.category)}">${escapeHtml(post.category)}</span>
                    <h6 class="fw-bold mt-2" style="font-size: 0.95rem; line-height: 1.4;">${escapeHtml(post.title.substring(0, 60))}${post.title.length > 60 ? '...' : ''}</h6>
                    <div class="small text-muted mb-2">
                        <i class="bi bi-person-circle"></i> ${escapeHtml(post.author)} · ${escapeHtml(post.publishedTime)}
                    </div>
                    <a class="slide-read-link related-read-link" data-id="${post.id}" style="cursor: pointer;">
                        Read more <i class="bi bi-arrow-right"></i>
                    </a>
                </div>
            </div>
        </div>
    `).join('');
    
    if (relatedSwiper) {
        relatedSwiper.destroy(true, true);
        relatedSwiper = null;
    }
    
    relatedSwiper = new Swiper(".relatedSwiper", {
        slidesPerView: 1.2,
        spaceBetween: 16,
        breakpoints: { 640: { slidesPerView: 2 }, 768: { slidesPerView: 2.5 }, 1024: { slidesPerView: 3.5 } },
        navigation: { nextEl: "#relatedNextBtn", prevEl: "#relatedPrevBtn" }
    });
    
    container.style.display = 'block';
    
    const backButtonContainer = document.getElementById('backToHomeContainer');
    if (backButtonContainer) {
        backButtonContainer.style.display = 'block';
        const backButton = document.getElementById('backToHomeBtn');
        if (backButton) {
            const newBackButton = backButton.cloneNode(true);
            backButton.parentNode.replaceChild(newBackButton, backButton);
            newBackButton.addEventListener('click', function(e) {
                e.preventDefault();
                navigateToHome();
            });
        }
    }
    
    document.querySelectorAll('.related-category-badge').forEach(badge => {
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            const category = badge.getAttribute('data-category');
            navigateToCategory(category);
        });
    });
    
    document.querySelectorAll('.related-read-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const postId = link.getAttribute('data-id');
            navigateToPost(postId);
        });
    });
}

async function loadHeaderConfig() {
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/configure!A:F?key=${CONFIG.API_KEY}`;
        const resp = await fetch(url);
        const data = await resp.json();
        const rows = data.values || [];
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
    } catch(e) { renderHeader("Blog Studio", "", []); }
}

function renderHeader(title, logoUrl, menus) {
    let logoHtml = logoUrl ? `<img src="${logoUrl}" height="35" alt="logo">` : `<i class="bi bi-journal-bookmark-fill fs-3" style="color:#1a73e8"></i>`;
    let navHtml = `<nav class="navbar navbar-expand-lg bg-white border-bottom sticky-top px-3 px-md-5 py-2 shadow-sm">
        <div class="container-fluid">
            <a class="navbar-brand fw-bold" href="./index.html">${logoHtml} ${title}</a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#blogNavbar">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="blogNavbar">
                <ul class="navbar-nav ms-auto mb-2 mb-lg-0 gap-2">`;
    menus.forEach(menu => {
        if(menu.subItems.length) {
            navHtml += `<li class="nav-item dropdown"><a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">${menu.name}</a><ul class="dropdown-menu">`;
            menu.subItems.forEach(sub => { navHtml += `<li><a class="dropdown-item" href="${sub.url}">${sub.label}</a></li>`; });
            navHtml += `</ul></li>`;
        } else {
            navHtml += `<li class="nav-item"><a class="nav-link" href="#">${menu.name}</a></li>`;
        }
    });
    navHtml += `</ul></div></div></nav>`;
    document.getElementById('main-header').innerHTML = navHtml;
}

async function fetchPostData(postId) {
    const blogUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/blog%20data!A:I?key=${CONFIG.API_KEY}`;
    const commentsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/Comments%20data!A:D?key=${CONFIG.API_KEY}`;
    const [blogRes, commRes] = await Promise.all([fetch(blogUrl), fetch(commentsUrl)]);
    const blogJson = await blogRes.json();
    const commJson = await commRes.json();
    const rows = blogJson.values || [];
    if(rows.length < 2) throw new Error("No posts found");
    
    let foundPost = null;
    for(let i=1; i<rows.length; i++) {
        let row = rows[i];
        if(String(row[0]).trim() === String(postId).trim()) {
            foundPost = {
                id: row[0], category: row[1] || "General", tags: row[2] || "",
                author: row[3] || "Anonymous", publishedTime: row[4] || "",
                title: row[5] || "Untitled", content: row[6] || "",
                likeCount: parseInt(row[7]) || 0, shareCount: parseInt(row[8]) || 0
            };
            break;
        }
    }
    if(!foundPost) throw new Error(`Post ID ${postId} not found`);
    
    const commentRows = commJson.values || [];
    let comments = [];
    for(let i=1; i<commentRows.length; i++) {
        let r = commentRows[i];
        if(String(r[0]).trim() === String(postId).trim()) {
            comments.push({ user: r[1] || "Anonymous", date: r[2] || "", text: r[3] || "" });
        }
    }
    return { post: foundPost, comments };
}

async function fetchAuthorProfile(authorName) {
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/profiles!A:D?key=${CONFIG.API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        const rows = data.values || [];
        for(let i=1; i<rows.length; i++) {
            if(rows[i][0] && rows[i][0].trim().toLowerCase() === authorName.toLowerCase()) {
                return {
                    name: rows[i][0],
                    designation: rows[i][1] || '',
                    about: rows[i][2] || '',
                    imageUrl: rows[i][3] || null
                };
            }
        }
        return { name: authorName, designation: '', about: '', imageUrl: null };
    } catch(error) {
        return { name: authorName, designation: '', about: '', imageUrl: null };
    }
}

function removeFirstImageFromContent(html) {
    if (!html) return html;
    return html.replace(/<img[^>]+>/i, '');
}

function escapeHtml(str) { 
    if(!str) return ''; 
    return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m] || m)); 
}

// ======================== COMMENTS FUNCTIONS ========================
function renderCommentsSection() {
    const wrapper = document.getElementById("postContentWrapper");
    let existingDiv = document.getElementById("commentsArea");
    if(existingDiv) existingDiv.remove();
    
    const commentsDiv = document.createElement("div");
    commentsDiv.id = "commentsArea";
    commentsDiv.className = "comment-section";
    
    let commentsHtml = `<h5 class="fw-bold mb-3"><i class="bi bi-chat-left-text"></i> Comments (<span id="commentsCountSpan">${allComments.length}</span>)</h5>`;
    commentsHtml += `<div id="commentsContainer">`;
    if(allComments.length === 0) {
        commentsHtml += `<p class="text-muted no-comments-msg">Be the first to comment.</p>`;
    } else {
        allComments.forEach((c, index) => {
            commentsHtml += `<div class="comment-card" data-temp-id="${c.tempId || ''}">
                <div>
                    <span class="comment-user">${escapeHtml(c.user)}</span>
                    <span class="comment-date">${escapeHtml(c.date)}</span>
                </div>
                <p class="mt-2 mb-0">${escapeHtml(c.text)}</p>
            </div>`;
        });
    }
    commentsHtml += `</div>`;
    commentsHtml += `<div class="new-comment-form mt-4"><label class="fw-semibold">Add a comment</label>
        <textarea id="commentTextInput" class="form-control my-2" rows="2" placeholder="Write your thoughts..."></textarea>
        <div><button id="submitCommentBtn" class="btn btn-primary rounded-pill px-4 mt-2"><i class="bi bi-send"></i> Post comment</button></div></div>`;
    
    commentsDiv.innerHTML = commentsHtml;
    wrapper.appendChild(commentsDiv);
    
    const submitBtn = document.getElementById("submitCommentBtn");
    if (submitBtn) {
        const newSubmitBtn = submitBtn.cloneNode(true);
        submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
        
        newSubmitBtn.addEventListener("click", async () => {
            let commentText = document.getElementById("commentTextInput").value.trim();
            if(!commentText) { showToastMessage("Please write a comment", true); return; }
            let userName = commenterName;
            if(!userName) {
                userName = prompt("Enter your name:");
                if(!userName) return;
                localStorage.setItem('commenterName', userName);
                commenterName = userName;
            }
            optimisticCommentUpdate(userName, commentText);
        });
    }
}

async function submitCommentToServer(postId, userName, commentText, tempCommentId) {
    try {
        const formData = new FormData();
        formData.append('action', 'comment');
        formData.append('postId', postId);
        formData.append('userName', userName);
        formData.append('commentText', commentText);
        
        const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        
        if(result.success) {
            const commentElement = document.querySelector(`.comment-card[data-temp-id="${tempCommentId}"]`);
            if (commentElement) {
                const dateSpan = commentElement.querySelector('.comment-date');
                if (dateSpan && result.timestamp) {
                    dateSpan.innerText = result.timestamp;
                }
                commentElement.removeAttribute('data-temp-id');
            }
            showToastMessage('💬 Comment posted!');
            return { success: true, timestamp: result.timestamp };
        } else {
            throw new Error(result.error);
        }
    } catch(error) {
        console.error('Comment sync error:', error);
        const commentElement = document.querySelector(`.comment-card[data-temp-id="${tempCommentId}"]`);
        if (commentElement) {
            commentElement.remove();
            const commentsCountSpan = document.getElementById('commentsCountSpan');
            if (commentsCountSpan) {
                commentsCountSpan.innerText = allComments.length - 1;
            }
        }
        showToastMessage('Failed to post comment. Please try again.', true);
        return { success: false };
    } finally {
        isCommentPending = false;
    }
}

function optimisticCommentUpdate(userName, commentText) {
    if (isCommentPending) {
        showToastMessage('Please wait, posting your previous comment...', true);
        return false;
    }
    
    const timestamp = new Date().toLocaleString();
    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    
    const optimisticComment = {
        user: userName,
        date: timestamp + ' (Syncing...)',
        text: commentText,
        isOptimistic: true,
        tempId: tempId
    };
    
    allComments.push(optimisticComment);
    const commentsContainer = document.getElementById('commentsContainer');
    if (commentsContainer) {
        const noCommentsMsg = commentsContainer.querySelector('.no-comments-msg');
        if (noCommentsMsg) noCommentsMsg.remove();
        
        const commentHtml = `<div class="comment-card" data-temp-id="${tempId}">
            <div>
                <span class="comment-user">${escapeHtml(userName)}</span>
                <span class="comment-date">${escapeHtml(timestamp)} (Syncing...)</span>
            </div>
            <p class="mt-2 mb-0">${escapeHtml(commentText)}</p>
        </div>`;
        commentsContainer.insertAdjacentHTML('beforeend', commentHtml);
    }
    
    const commentInput = document.getElementById("commentTextInput");
    if (commentInput) commentInput.value = "";
    
    const commentsCountSpan = document.getElementById('commentsCountSpan');
    if (commentsCountSpan) commentsCountSpan.innerText = allComments.length;
    
    showToastMessage('💬 Comment posted! (Syncing...)');
    isCommentPending = true;
    submitCommentToServer(currentPost.id, userName, commentText, tempId);
    return true;
}

// ======================== SHARE FUNCTIONS ========================
function shareOnFacebook(url, title) {
    const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    window.open(shareUrl, '_blank', 'width=600,height=400');
}

function shareOnTwitter(url, title) {
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;
    window.open(shareUrl, '_blank', 'width=600,height=400');
}

function shareOnWhatsApp(url, title) {
    const shareUrl = `https://wa.me/?text=${encodeURIComponent(title + ' ' + url)}`;
    window.open(shareUrl, '_blank', 'width=600,height=400');
}

function shareOnLinkedIn(url, title) {
    const shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    window.open(shareUrl, '_blank', 'width=600,height=400');
}

function shareOnPinterest(url, title, imageUrl) {
    const shareUrl = `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&media=${encodeURIComponent(imageUrl)}&description=${encodeURIComponent(title)}`;
    window.open(shareUrl, '_blank', 'width=600,height=400');
}

function copyToClipboard(url) {
    navigator.clipboard.writeText(url).then(() => {
        showToastMessage('📋 Blog URL copied to clipboard!');
        const shareModal = document.getElementById('shareModal');
        if (shareModal) shareModal.classList.remove('active');
    }).catch(() => {
        showToastMessage('Failed to copy URL', true);
    });
}

function closeShareModal() {
    const shareModal = document.getElementById('shareModal');
    if (shareModal) shareModal.classList.remove('active');
}

function createShareModal() {
    if (document.getElementById('shareModal')) return;
    
    const modalHtml = `
        <div id="shareModal" class="share-modal">
            <div class="share-modal-content">
                <div class="share-modal-header">
                    <h5><i class="bi bi-share-fill"></i> Share this post</h5>
                    <button class="share-modal-close" onclick="closeShareModal()">&times;</button>
                </div>
                <div class="share-modal-body">
                    <div class="share-options">
                        <button class="share-option facebook" onclick="shareOnFacebook(window.currentShareUrl, window.currentShareTitle)">
                            <i class="bi bi-facebook"></i> Facebook
                        </button>
                        <button class="share-option twitter" onclick="shareOnTwitter(window.currentShareUrl, window.currentShareTitle)">
                            <i class="bi bi-twitter-x"></i> Twitter
                        </button>
                        <button class="share-option whatsapp" onclick="shareOnWhatsApp(window.currentShareUrl, window.currentShareTitle)">
                            <i class="bi bi-whatsapp"></i> WhatsApp
                        </button>
                        <button class="share-option linkedin" onclick="shareOnLinkedIn(window.currentShareUrl, window.currentShareTitle)">
                            <i class="bi bi-linkedin"></i> LinkedIn
                        </button>
                        <button class="share-option pinterest" onclick="shareOnPinterest(window.currentShareUrl, window.currentShareTitle, window.currentShareImage)">
                            <i class="bi bi-pinterest"></i> Pinterest
                        </button>
                        <button class="share-option copy" onclick="copyToClipboard(window.currentShareUrl)">
                            <i class="bi bi-link-45deg"></i> Copy Link
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function openShareModal(url, title, imageUrl) {
    createShareModal();
    window.currentShareUrl = url;
    window.currentShareTitle = title;
    window.currentShareImage = imageUrl;
    const shareModal = document.getElementById('shareModal');
    if (shareModal) shareModal.classList.add('active');
}

// ======================== POST RENDERING ========================
async function renderPostPage(post, comments) {
    allComments = comments;
    document.getElementById("loadingSpinner").style.display = "none";
    document.getElementById("postContentWrapper").style.display = "block";

    updateSocialMetaTags(post);
    document.title = `${post.title} | NOC / blog`;
    updateBrowserUrl(post.id);
    
    const avatarLetter = (post.author.charAt(0) || 'A').toUpperCase();
    const featuredImg = extractFirstImage(post.content);
    const authorProfile = await fetchAuthorProfile(post.author);
    let contentWithoutFirstImage = post.content;
    if (featuredImg) {
        contentWithoutFirstImage = removeFirstImageFromContent(post.content);
    }
    
    let authorAvatarHtml = '';
    if (authorProfile.imageUrl) {
        authorAvatarHtml = `<img src="${authorProfile.imageUrl}" class="author-avatar-img author-link" 
                            data-author="${escapeHtml(post.author)}" 
                            data-designation="${escapeHtml(authorProfile.designation)}"
                            alt="${escapeHtml(post.author)}"
                            onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\'avatar d-inline-flex author-link\' data-author=\'${escapeHtml(post.author)}\' data-designation=\'${escapeHtml(authorProfile.designation)}\'>${avatarLetter}</div>';">`;
    } else {
        authorAvatarHtml = `<div class="avatar d-inline-flex author-link" 
                             data-author="${escapeHtml(post.author)}" 
                             data-designation="${escapeHtml(authorProfile.designation)}">
                             ${avatarLetter}
                           </div>`;
    }
    
    const shareUrl = getCurrentPageUrl(post.id);
    
    let contentHtml = `<div class="blog-header">
        <div class="text-muted small mb-2">
            <span class="category-link" data-category="${escapeHtml(post.category)}">
                <i class="bi bi-folder"></i> ${escapeHtml(post.category)}
            </span>
        </div>
        <h1 class="blog-title">${escapeHtml(post.title)}</h1>
        <div class="blog-meta">
            <div class="d-flex align-items-center gap-2">
                ${authorAvatarHtml}
                <div>
                    <div class="author-link fw-bold" data-author="${escapeHtml(post.author)}" data-designation="${escapeHtml(authorProfile.designation)}">
                        ${escapeHtml(post.author)}
                    </div>
                    ${authorProfile.designation ? `<div class="small text-muted">${escapeHtml(authorProfile.designation)}</div>` : ''}
                </div>
            </div>
            <span><i class="bi bi-calendar3"></i> ${escapeHtml(post.publishedTime)}</span>
            <span><i class="bi bi-tag"></i> ${escapeHtml(post.tags) || 'general'}</span>
        </div>
    </div>`;
    
    if(featuredImg) {
        contentHtml += `<div class="post-featured-img-container">
            <img src="${featuredImg}" class="post-featured-img-full" alt="Featured image for ${escapeHtml(post.title)}">
        </div>`;
    }
    
    contentHtml += `<div class="blog-content-wrapper">
        <div class="blog-content">${contentWithoutFirstImage}</div>
    </div>
    <div class="action-bar">
        <button id="likeButton" class="action-btn like-btn"><i class="bi bi-hand-thumbs-up"></i> <span id="likeCountSpan">${post.likeCount}</span> likes</button>
        <span><i class="bi bi-chat-dots"></i> ${comments.length} comments</span>
        <button id="shareButton" class="action-btn share-btn"><i class="bi bi-share-fill"></i> Share</button>
    </div>`;
    
    document.getElementById("postContentWrapper").innerHTML = contentHtml;
    renderCommentsSection();
    
    initTTSWidget();
    setupScrollTracking();
    setupPageUnloadHandler();
    
    const sliderContainer = document.getElementById('relatedPostsSliderContainer');
    const commentsArea = document.getElementById('commentsArea');
    if (sliderContainer && commentsArea) {
        commentsArea.insertAdjacentElement('afterend', sliderContainer);
    }
    
    renderRelatedPostsSlider(post.id, post.category);
    
    document.querySelector('.category-link')?.addEventListener('click', (e) => {
        const category = e.currentTarget.getAttribute('data-category');
        navigateToCategory(category);
    });
    
    document.querySelectorAll('.author-link').forEach(el => {
        el.addEventListener('click', (e) => {
            const authorName = el.getAttribute('data-author');
            const authorDesignation = el.getAttribute('data-designation');
            navigateToAuthor(authorName, authorDesignation);
        });
    });
    
    const likeButton = document.getElementById("likeButton");
    if (likeButton) {
        const newLikeButton = likeButton.cloneNode(true);
        likeButton.parentNode.replaceChild(newLikeButton, likeButton);
        
        newLikeButton.addEventListener("click", async (e) => {
            e.preventDefault();
            if (isLikePending) {
                showToastMessage("Please wait, your like is being processed...", true);
                return;
            }
            
            const likeSpan = document.getElementById("likeCountSpan");
            if (likeSpan && !isLikePending) {
                const currentLikeCount = parseInt(likeSpan.innerText) || 0;
                likeSpan.innerText = currentLikeCount + 1;
                const btn = document.getElementById("likeButton");
                if (btn) {
                    btn.disabled = true;
                    btn.style.opacity = '0.6';
                    btn.style.cursor = 'wait';
                }
                isLikePending = true;
                showToastMessage('❤️ Liked!');
                
                try {
                    const formData = new FormData();
                    formData.append('action', 'like');
                    formData.append('postId', currentPost.id);
                    const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: formData
                    });
                    const result = await response.json();
                    if(result.success) {
                        if (likeSpan && result.newLikes !== parseInt(likeSpan.innerText)) {
                            likeSpan.innerText = result.newLikes;
                        }
                    } else {
                        throw new Error(result.error);
                    }
                } catch(error) {
                    console.error('Like sync error:', error);
                    showToastMessage('Failed to sync like. Please try again.', true);
                    if (likeSpan) {
                        likeSpan.innerText = currentLikeCount;
                    }
                } finally {
                    isLikePending = false;
                    const btn = document.getElementById("likeButton");
                    if (btn) {
                        btn.disabled = false;
                        btn.style.opacity = '1';
                        btn.style.cursor = 'pointer';
                    }
                }
            }
        });
    }
    
    document.getElementById("shareButton")?.addEventListener("click", () => {
        openShareModal(shareUrl, post.title, featuredImg);
    });
    
    // Refresh TTS content after everything is fully rendered
    setTimeout(() => {
        refreshTTSContent();
    }, 300);
}

// ======================== INITIALIZATION ========================
async function initPostPage() {
    await loadHeaderConfig();
    loadTTSPreferences();
    await loadVoices();
    
    let postId = getPostIdFromUrl();
    if(!postId) {
        document.getElementById("loadingSpinner").innerHTML = `<div class="error-box alert alert-danger">
            <i class="bi bi-exclamation-triangle-fill"></i><br>
            <strong>No post ID found!</strong><br>
            Please use a valid post URL like:<br>
            <code>post.html?id=1</code>
        </div>`;
        return;
    }
    
    currentPostId = postId;
    try {
        allPostsMaster = await fetchAllPosts();
        const { post, comments } = await fetchPostData(postId);
        currentPost = post;
        await renderPostPage(post, comments);
    } catch(err) {
        console.error('Init error:', err);
        document.getElementById("loadingSpinner").innerHTML = `<div class="error-box alert alert-danger">
            <strong>Error loading post:</strong><br>
            ${err.message}<br>
            <a href="./index.html">← Back to Home</a>
        </div>`;
    }
}

// ======================== EVENT LISTENERS ========================
window.addEventListener('popstate', function(event) {
    const postId = getPostIdFromUrl();
    if (postId && postId !== currentPostId) {
        window.location.reload();
    }
});

// Make functions globally accessible
window.shareOnFacebook = shareOnFacebook;
window.shareOnTwitter = shareOnTwitter;
window.shareOnWhatsApp = shareOnWhatsApp;
window.shareOnLinkedIn = shareOnLinkedIn;
window.shareOnPinterest = shareOnPinterest;
window.copyToClipboard = copyToClipboard;
window.closeShareModal = closeShareModal;
window.closeTTSSettings = closeTTSSettings;
window.toggleTTSPlayback = toggleTTSPlayback;

// Start the application
initPostPage();

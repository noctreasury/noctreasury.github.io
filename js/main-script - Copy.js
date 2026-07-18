// Google Sheets configuration
const SPREADSHEET_ID = '1jd1xZe9x2mrZm5KAwGT12vMNYjbrnynsmelNKeK95jc';
const API_KEY = 'AIzaSyBB1V3vJpNZ9X1GIF-YOwoa6YSt_iXMLo0';
const MENU_SHEET = 'Menu';
const ICON_SHEET = 'icons';
const LOGIN_SHEET = 'Login';
const FLASH_SHEET = 'scroll texts';
const MENU_RANGE = 'A:D';
const ICON_RANGE = 'A:F';
const LOGIN_RANGE = 'B:D';
const FLASH_RANGE = 'A:A';

let menuData = [];
let iconData = new Map();
let isAuthenticated = false;
let currentUser = null;
let flashNewsInterval = null;

// Theme functions
function initTheme() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.body.className = savedTheme;
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) themeToggle.checked = savedTheme === 'dark-theme';
    } else {
        document.body.className = prefersDark ? 'dark-theme' : 'light-theme';
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) themeToggle.checked = prefersDark;
    }
}

function toggleTheme() {
    const isDark = document.body.classList.contains('dark-theme');
    const newTheme = isDark ? 'light-theme' : 'dark-theme';
    document.body.className = newTheme;
    localStorage.setItem('theme', newTheme);
}

// Show error message in login footer
function showLoginError(message) {
    const errorDiv = document.getElementById('loginError');
    const errorText = document.getElementById('errorMessageText');
    if (errorDiv && errorText) {
        errorText.textContent = message;
        errorDiv.style.display = 'flex';
        
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }
}

// Hide error message
function hideLoginError() {
    const errorDiv = document.getElementById('loginError');
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }
}

// Flash News Functions
async function fetchAndDisplayFlashNews() {
    const flashContainer = document.getElementById('flashNewsContainer');
    const flashTicker = document.getElementById('flashNewsTicker');
    
    if (!flashContainer || !flashTicker) return;
    
    try {
        // Fetch from A2:A range (starting from row 2 to skip header)
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${FLASH_SHEET}!A2:A?key=${API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error) {
            console.warn('Flash news sheet error:', data.error);
            flashContainer.classList.add('hidden');
            adjustWrapperHeightForTicker();
            return;
        }
        
        let newsItems = [];
        if (data.values && data.values.length > 0) {
            // Filter out empty cells, undefined, null, and whitespace-only strings
            newsItems = data.values
                .map(row => row[0] ? row[0].toString().trim() : '')
                .filter(text => text !== '' && text !== null && text !== undefined);
        }
        
        // Check if there are any valid news items
        if (newsItems.length === 0) {
            console.log('No scroll texts found in A2:A range, hiding ticker');
            flashContainer.classList.add('hidden');
            adjustWrapperHeightForTicker();
            return;
        }
        
        // Build ticker HTML with icon and text - NO DUPLICATION
        let tickerHtml = '';
        newsItems.forEach((item) => {
            tickerHtml += `<span><i class="bi bi-megaphone-fill"></i> ${escapeHtml(item)}</span>`;
        });
        
        // Calculate scroll speed based on number of items and total content width
        // Slower speed for more content, faster for less content
        const totalItems = newsItems.length;
        // Base speed: 25 seconds, adjusted by item count (more items = slower speed)
        // Range: 15 seconds (min) to 40 seconds (max)
        let scrollDuration = Math.min(40, Math.max(15, 25 + (totalItems * 0.5)));
        
        flashTicker.innerHTML = tickerHtml;
        
        // Remove existing animation and reapply with new duration
        flashTicker.style.animation = 'none';
        flashTicker.offsetHeight; // Force reflow
        flashTicker.style.animation = `scroll-left ${scrollDuration}s linear infinite`;
        
        // Show the container
        flashContainer.classList.remove('hidden');
        adjustWrapperHeightForTicker();
        
        console.log(`Flash news ticker displayed with ${newsItems.length} items, scroll duration: ${scrollDuration}s`);
        
    } catch (error) {
        console.error('Error fetching flash news:', error);
        flashContainer.classList.add('hidden');
        adjustWrapperHeightForTicker();
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function adjustWrapperHeightForTicker() {
    const flashContainer = document.getElementById('flashNewsContainer');
    const wrapper = document.querySelector('.dashboard-container .wrapper');
    
    if (!wrapper) return;
    
    const navbar = document.querySelector('.navbar-custom');
    const navbarHeight = navbar ? navbar.offsetHeight : 73;
    const isTickerVisible = flashContainer && !flashContainer.classList.contains('hidden');
    const tickerHeight = isTickerVisible && flashContainer ? flashContainer.offsetHeight : 0;
    const viewportHeight = window.innerHeight;
    
    wrapper.style.height = `${viewportHeight - navbarHeight - tickerHeight}px`;
}

// Login validation
async function validateLogin(username, password) {
    try {
        const loginUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${LOGIN_SHEET}!${LOGIN_RANGE}?key=${API_KEY}`;
        const response = await fetch(loginUrl);
        const data = await response.json();
        
        if (data.error) {
            console.error('API Error:', data.error);
            return null;
        }
        
        if (data.values) {
            for (let i = 0; i < data.values.length; i++) {
                const row = data.values[i];
                if (row.length >= 2) {
                    const storedUsername = row[0];
                    const storedPassword = row[1];
                    
                    if (username === storedUsername && password === storedPassword) {
                        const menuSheet = row.length >= 3 && row[2] ? row[2].trim() : null;
                        
                        if (!menuSheet) {
                            console.error('No menu sheet specified for user:', username);
                            return null;
                        }
                        
                        return {
                            username: storedUsername,
                            menuSheet: menuSheet
                        };
                    }
                }
            }
        }
        
        return null;
    } catch (error) {
        console.error('Login validation error:', error);
        return null;
    }
}

// Login handler
async function handleLogin() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const loginBtn = document.getElementById('loginBtn');
    const loginSpinner = document.getElementById('loginSpinner');
    const loginText = document.getElementById('loginText');
    const loginOverlay = document.getElementById('loginOverlay');
    
    hideLoginError();
    
    if (!username || !password) {
        showLoginError('Please enter both username and password');
        return;
    }
    
    loginBtn.disabled = true;
    loginSpinner.classList.remove('d-none');
    loginText.textContent = 'Verifying...';
    document.activeElement.blur();
    
    try {
        const userData = await validateLogin(username, password);
        
        if (userData) {
            isAuthenticated = true;
            currentUser = userData;
            
            localStorage.setItem('currentUser', JSON.stringify({
                username: userData.username,
                loginTime: new Date().toISOString(),
                menuSheet: userData.menuSheet
            }));
            
            sessionStorage.setItem('currentUser', JSON.stringify({
                username: userData.username,
                loginTime: new Date().toISOString(),
                menuSheet: userData.menuSheet
            }));
            
            loginOverlay.style.opacity = '0';
            
            setTimeout(() => {
                loginOverlay.style.display = 'none';
                document.getElementById('dashboardContainer').style.display = 'block';
                loadMenuData(userData.menuSheet);
                setTimeout(() => {
                    fetchAndDisplayFlashNews();
                }, 100);
            }, 500);
        } else {
            loginBtn.disabled = false;
            loginSpinner.classList.add('d-none');
            loginText.textContent = 'Login';
            document.getElementById('password').value = '';
            showLoginError('Invalid username or password');
            document.getElementById('username').focus();
        }
    } catch (error) {
        console.error('Login error:', error);
        loginBtn.disabled = false;
        loginSpinner.classList.add('d-none');
        loginText.textContent = 'Login';
        showLoginError('Unable to verify credentials. Please try again.');
        document.getElementById('username').focus();
    }
}

// Logout function
function logout() {
    localStorage.removeItem('currentUser');
    sessionStorage.removeItem('currentUser');
    currentUser = null;
    isAuthenticated = false;
    
    const loginOverlay = document.getElementById('loginOverlay');
    const dashboardContainer = document.getElementById('dashboardContainer');
    const flashContainer = document.getElementById('flashNewsContainer');
    
    if (flashContainer) {
        flashContainer.classList.add('hidden');
    }
    
    loginOverlay.style.display = 'flex';
    loginOverlay.style.opacity = '1';
    dashboardContainer.style.display = 'none';
    
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    
    setTimeout(() => {
        document.getElementById('username').focus();
    }, 100);
}

// Display logged-in user in sidebar
function displayLoggedInUser() {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
        try {
            const userData = JSON.parse(storedUser);
            currentUser = userData;
            
            const existingDesktopUser = document.getElementById('desktopUserInfo');
            if (existingDesktopUser) existingDesktopUser.remove();
            
            const existingMobileUser = document.getElementById('mobileUserInfo');
            if (existingMobileUser) existingMobileUser.remove();
            
            const desktopSidebar = document.getElementById('desktopSidebar');
            if (desktopSidebar) {
                const userInfoDiv = document.createElement('div');
                userInfoDiv.className = 'user-info-sidebar';
                userInfoDiv.id = 'desktopUserInfo';
                userInfoDiv.innerHTML = `
                    <div class="user-info-content">
                        <div class="user-avatar">
                            <i class="bi bi-person-circle"></i>
                        </div>
                        <div class="user-details">
                            <span class="user-label">Logged in as</span>
                            <span class="user-name">${escapeHtml(userData.username)}</span>
                            <span class="user-login-time">${new Date(userData.loginTime).toLocaleString()}</span>
                        </div>
                        <button class="logout-icon-btn" onclick="logout()" title="Logout">
                            <i class="bi bi-box-arrow-right"></i>
                        </button>
                    </div>
                `;
                desktopSidebar.insertBefore(userInfoDiv, desktopSidebar.firstChild);
            }
            
            const mobileSidebar = document.getElementById('mobileSidebar');
            if (mobileSidebar) {
                const userInfoDiv = document.createElement('div');
                userInfoDiv.className = 'user-info-sidebar';
                userInfoDiv.id = 'mobileUserInfo';
                userInfoDiv.innerHTML = `
                    <div class="user-info-content">
                        <div class="user-avatar">
                            <i class="bi bi-person-circle"></i>
                        </div>
                        <div class="user-details">
                            <span class="user-label">Logged in as</span>
                            <span class="user-name">${escapeHtml(userData.username)}</span>
                            <span class="user-login-time">${new Date(userData.loginTime).toLocaleString()}</span>
                        </div>
                        <button class="logout-icon-btn" onclick="logout()" title="Logout">
                            <i class="bi bi-box-arrow-right"></i>
                        </button>
                    </div>
                `;
                mobileSidebar.insertBefore(userInfoDiv, mobileSidebar.firstChild);
            }
        } catch (e) {
            console.error('Error parsing user data:', e);
        }
    }
}

// Check for existing session
function checkExistingSession() {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
        try {
            const userData = JSON.parse(storedUser);
            const loginTime = new Date(userData.loginTime);
            const now = new Date();
            const hoursSinceLogin = (now - loginTime) / (1000 * 60 * 60);
            
            if (hoursSinceLogin > 24) {
                logout();
                return;
            }
            
            isAuthenticated = true;
            currentUser = userData;
            
            const loginOverlay = document.getElementById('loginOverlay');
            const dashboardContainer = document.getElementById('dashboardContainer');
            
            loginOverlay.style.display = 'none';
            dashboardContainer.style.display = 'block';
            
            loadMenuData(userData.menuSheet);
            setTimeout(() => {
                fetchAndDisplayFlashNews();
            }, 100);
        } catch (e) {
            console.error('Error restoring session:', e);
            logout();
        }
    }
}

// Menu data functions
function processIconData(rows) {
    if (!rows || rows.length < 2) return;
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 6) continue;
        const [mainMenu, mainIcon, subMenu, subIcon, linkItem, linkIcon] = row;
        if (mainMenu && subMenu && linkItem) {
            const key = `${mainMenu}|${subMenu}|${linkItem}`;
            iconData.set(key, {
                mainIcon: mainIcon || '<i class="bi bi-folder2"></i>',
                subIcon: subIcon || '<i class="bi bi-folder2"></i>',
                linkIcon: linkIcon || '<i class="bi bi-link-45deg"></i>'
            });
            const mainKey = `${mainMenu}||`;
            if (!iconData.has(mainKey)) iconData.set(mainKey, { mainIcon: mainIcon || '<i class="bi bi-grid"></i>' });
            const subKey = `${mainMenu}|${subMenu}|`;
            if (!iconData.has(subKey)) iconData.set(subKey, { subIcon: subIcon || '<i class="bi bi-folder"></i>' });
        }
    }
}

function getIcon(mainMenu, subMenu = '', linkItem = '', level) {
    const key = `${mainMenu}|${subMenu}|${linkItem}`;
    const icons = iconData.get(key);
    if (icons) {
        switch (level) {
            case 'main': return icons.mainIcon || '<i class="bi bi-grid"></i>';
            case 'sub': return icons.subIcon || '<i class="bi bi-folder"></i>';
            case 'link': return icons.linkIcon || '<i class="bi bi-link-45deg"></i>';
        }
    }
    if (level === 'main') {
        const mainKey = `${mainMenu}||`;
        const mainIcons = iconData.get(mainKey);
        if (mainIcons && mainIcons.mainIcon) return mainIcons.mainIcon;
    }
    if (level === 'sub') {
        const subKey = `${mainMenu}|${subMenu}|`;
        const subIcons = iconData.get(subKey);
        if (subIcons && subIcons.subIcon) return subIcons.subIcon;
    }
    switch (level) {
        case 'main': return '<i class="bi bi-grid"></i>';
        case 'sub': return '<i class="bi bi-folder"></i>';
        case 'link': return '<i class="bi bi-link-45deg"></i>';
        default: return '<i class="bi bi-folder2"></i>';
    }
}

function processMenuData(rows) {
    if (!rows || rows.length < 2) return [];
    const menuMap = new Map();
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 4) continue;
        const [mainMenu, subMenu, linkItem, url] = row;
        if (!mainMenu || !subMenu || !linkItem || !url) continue;
        if (!menuMap.has(mainMenu)) menuMap.set(mainMenu, new Map());
        const subMenuMap = menuMap.get(mainMenu);
        if (!subMenuMap.has(subMenu)) subMenuMap.set(subMenu, []);
        subMenuMap.get(subMenu).push({
            title: linkItem,
            url: url,
            icon: getIcon(mainMenu, subMenu, linkItem, 'link')
        });
    }
    return Array.from(menuMap.entries()).map(([mainMenu, subMenuMap]) => ({
        title: mainMenu,
        icon: getIcon(mainMenu, '', '', 'main'),
        subMenus: Array.from(subMenuMap.entries()).map(([subMenu, items]) => ({
            title: subMenu,
            icon: getIcon(mainMenu, subMenu, '', 'sub'),
            items: items
        }))
    }));
}

async function fetchSheetData(menuSheetName) {
    try {
        console.log('Fetching menu from sheet:', menuSheetName);
        
        iconData.clear();
        
        const menuUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${menuSheetName}!${MENU_RANGE}?key=${API_KEY}`;
        const menuResponse = await fetch(menuUrl);
        const menuData_raw = await menuResponse.json();
        
        if (menuData_raw.error) {
            console.error('Menu sheet error:', menuData_raw.error);
            throw new Error(`Menu sheet '${menuSheetName}' not found or inaccessible`);
        }
        
        const iconUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${ICON_SHEET}!${ICON_RANGE}?key=${API_KEY}`;
        const iconResponse = await fetch(iconUrl);
        const iconData_raw = await iconResponse.json();
        if (!iconData_raw.error) processIconData(iconData_raw.values);
        
        return processMenuData(menuData_raw.values);
    } catch (error) {
        console.error('Error fetching data:', error);
        showError('Error loading menu: ' + error.message);
        return [];
    }
}

async function loadMenuData(menuSheetName) {
    try {
        if (!menuSheetName) {
            showError('No menu sheet configured for this user');
            return;
        }
        
        menuData = await fetchSheetData(menuSheetName);
        renderMenuCards(menuData, 'desktopSidebar');
        renderMenuCards(menuData, 'mobileSidebar');
        
        displayLoggedInUser();
        
        const welcomeMsg = document.getElementById('welcome-message');
        if (welcomeMsg) welcomeMsg.style.display = 'block';
        
        const loading = document.getElementById('loading');
        if (loading) loading.style.display = 'none';
        
        if (currentUser) {
            console.log(`Logged in as: ${currentUser.username}, using menu sheet: ${menuSheetName}`);
        }
    } catch (error) {
        console.error('Error loading menu data:', error);
        showError('Error loading menu data');
    }
}

function showError(message) {
    const desktop = document.getElementById('desktopSidebar');
    const mobile = document.getElementById('mobileSidebar');
    if (desktop) desktop.innerHTML = `<div class="error-message text-danger p-3">${escapeHtml(message)}</div>`;
    if (mobile) mobile.innerHTML = `<div class="error-message text-danger p-3">${escapeHtml(message)}</div>`;
}

function renderMenuCards(menuData, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!menuData || menuData.length === 0) {
        container.innerHTML = '<div class="text-muted p-3">No menu items available for your account</div>';
        return;
    }
    let html = '';
    menuData.forEach(main => {
        let subHtml = '';
        main.subMenus.forEach(sub => {
            let linksHtml = '';
            sub.items.forEach(link => {
                linksHtml += `<li class="link-item" data-url="${link.url}">${link.icon} ${escapeHtml(link.title)}</li>`;
            });
            subHtml += `<div class="submenu-block">
                <div class="submenu-title">${sub.icon} ${escapeHtml(sub.title)}</div>
                <ul class="link-items">${linksHtml}</ul>
            </div>`;
        });
        html += `<div class="menu-card">
            <div class="menu-card-header">${main.icon} ${escapeHtml(main.title)}</div>
            <div class="menu-card-body">${subHtml}</div>
        </div>`;
    });
    container.innerHTML = html;
    container.querySelectorAll('.link-item').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            const url = el.dataset.url;
            loadUrlInIframe(url);
            if (window.innerWidth < 992) {
                const offcanvasEl = document.getElementById('mobileMenuOffcanvas');
                if (offcanvasEl) {
                    const bsOffcanvas = bootstrap.Offcanvas.getInstance(offcanvasEl);
                    if (bsOffcanvas) bsOffcanvas.hide();
                }
            }
        });
    });
}

function loadUrlInIframe(url) {
    const iframe = document.getElementById('content-frame');
    const loading = document.getElementById('loading');
    const welcomeMessage = document.getElementById('welcome-message');
    
    if (welcomeMessage) welcomeMessage.style.display = 'none';
    if (loading) loading.style.display = 'flex';
    
    let fullUrl = url;
    
    if (url.includes('treasury-status') && currentUser && currentUser.branch) {
        const separator = url.includes('?') ? '&' : '?';
        fullUrl = `${url}${separator}branch=${encodeURIComponent(currentUser.branch)}`;
    }
    
    iframe.onload = function() { 
        if (loading) loading.style.display = 'none'; 
    };
    
    iframe.onerror = function() { 
        if (loading) loading.style.display = 'none'; 
        alert('Error loading page: ' + fullUrl); 
    };
    
    iframe.src = fullUrl;
}

function initDesktopSidebarToggle() {
    const btn = document.getElementById('desktopSidebarToggle');
    const sidebar = document.getElementById('desktopSidebarContainer');
    if (!btn || !sidebar) return;
    btn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
    });
}

// Initialize everything
document.addEventListener('DOMContentLoaded', function() {
    initTheme();
    
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('change', toggleTheme);
    }
    
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', handleLogin);
    }
    
    const username = document.getElementById('username');
    const password = document.getElementById('password');
    
    if (username) {
        username.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (password) password.focus();
            }
        });
    }
    
    if (password) {
        password.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleLogin();
            }
        });
    }
    
    if (username) {
        username.addEventListener('input', hideLoginError);
    }
    if (password) {
        password.addEventListener('input', hideLoginError);
    }
    
    initDesktopSidebarToggle();
    
    const welcomeMsg = document.getElementById('welcome-message');
    if (welcomeMsg) welcomeMsg.style.display = 'none';
    
    checkExistingSession();
    
    window.addEventListener('resize', () => {
        if (isAuthenticated) {
            adjustWrapperHeightForTicker();
        }
    });
    
    setTimeout(() => {
        if (!isAuthenticated && username) {
            username.focus();
        }
    }, 100);
});

// Iframe load event
const contentFrame = document.getElementById('content-frame');
if (contentFrame) {
    contentFrame.addEventListener('load', function() {
        const loading = document.getElementById('loading');
        if (loading) loading.style.display = 'none';
    });
}

// Register service worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/network/sw.js')
            .then(registration => {
                console.log('ServiceWorker registered successfully with scope:', registration.scope);
            })
            .catch(error => {
                console.log('ServiceWorker registration failed:', error);
            });
    });
}

// Export functions for global access
window.fetchAndDisplayFlashNews = fetchAndDisplayFlashNews;
window.adjustWrapperHeightForTicker = adjustWrapperHeightForTicker;
window.logout = logout;
/* Internal Mailbox API client */
const MAILBOX_API_URL = window.MAILBOX_API_URL || 'https://script.google.com/macros/s/AKfycby-YQZngcKrKxSKwHoZ_e7fIyOfUvuF66x3dWJRod84DN8L9FiTQYvaajxtOZg0yh7z/exec';

const MailboxAPI = (() => {
  async function request(action, payload = {}) {
    const body = Object.assign({action}, payload);
    const response = await fetch(MAILBOX_API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain;charset=utf-8'},
      body: JSON.stringify(body),
      redirect: 'follow'
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || 'Request failed.');
    return data;
  }

  function token() { return sessionStorage.getItem('mailbox_token') || ''; }
  function user() {
    try { return JSON.parse(sessionStorage.getItem('mailbox_user') || 'null'); }
    catch (_) { return null; }
  }
  function setSession(data) {
    sessionStorage.setItem('mailbox_token', data.token);
    sessionStorage.setItem('mailbox_user', JSON.stringify(data.user));
  }
  function clearSession() {
    sessionStorage.removeItem('mailbox_token');
    sessionStorage.removeItem('mailbox_user');
  }
  function requireLogin() {
    if (!token()) location.href = 'login.html';
  }

  return {
    request,
    token,
    user,
    setSession,
    clearSession,
    requireLogin,
    login: (email, password) => request('login', {email, password}),
    logout: () => request('logout', {token:token()}),
    bootstrap: () => request('bootstrap', {token:token()}),
    list: (folder, search='') => request('listMessages', {token:token(), folder, search, limit:200}),
    get: (mailId) => request('getMessage', {token:token(), mailId}),suggestRecipients: (query) =>
  request('suggestRecipients', {
    token:token(),
    query:query
  }),

    send: payload => request('sendMessage', Object.assign({token:token()}, payload)),
    draft: payload => request('saveDraft', Object.assign({token:token()}, payload)),
    update: payload => request('updateMessage', Object.assign({token:token()}, payload)),
  };
})();

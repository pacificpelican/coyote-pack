const BASE = 'api/index.php';
let csrf = '';
let available = null;

async function call(action, body, query = '') {
  const opts = { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.headers['X-CSRF-Token'] = csrf;
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}?a=${action}${query}`, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('Server unavailable'); }
  if (data.csrf) csrf = data.csrf;
  if (!res.ok || data.ok === false) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  async status() {
    try {
      const s = await call('status');
      available = true;
      return s;
    } catch (e) {
      available = false;
      return null;
    }
  },
  get available() { return available; },
  register: (username, password) => call('register', { username, password }),
  login: (username, password) => call('login', { username, password }),
  logout: () => call('logout', {}),
  deleteAccount: (password) => call('delete', { password }),
  load: () => call('load'),
  save: (data) => call('save', { data }),
  debug: (ping) => call('debug', null, ping ? '&ping=1' : ''),
  dialogue: (speaker, topic, ctx, message) => (available === false ? Promise.resolve(null) : call('dialogue', { speaker, topic, ctx, message })),
};

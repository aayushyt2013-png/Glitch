// Shared Supabase authentication and guest-quota helpers.
function missingEnv() {
  return ['SUPABASE_URL', 'SUPABASE_ANON_KEY'].filter((k) => !process.env[k]);
}

const supabaseUrl = () => (process.env.SUPABASE_URL || '').replace(/\/+$/, '');

async function getUser(req) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const r = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id
    ? { id: u.id, email: String(u.email || '').toLowerCase(), isAnonymous: Boolean(u.is_anonymous), accessToken: token }
    : null;
}

function emailAllowed(email) {
  const list = String(process.env.ALLOWED_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.length === 0 || list.includes(email);
}

async function requireUser(req, res) {
  const missing = missingEnv();
  if (missing.length) {
    res.status(500).json({ error: `Server isn't configured yet. Missing: ${missing.join(', ')}.` });
    return null;
  }
  let user;
  try {
    user = await getUser(req);
  } catch (e) {
    res.status(502).json({ error: `Couldn't reach Supabase: ${e.message}` });
    return null;
  }
  if (!user) {
    res.status(401).json({ error: 'Please sign in.' });
    return null;
  }
  if (!user.isAnonymous && !emailAllowed(user.email)) {
    res.status(403).json({ error: "This account isn't on the allow-list." });
    return null;
  }
  return user;
}

// These RPCs run under the caller's JWT. The database derives auth.uid()
// itself, so a client cannot spend or inspect another guest's quota.
async function quotaRpc(user, rpc) {
  const r = await fetch(`${supabaseUrl()}/rest/v1/rpc/${rpc}`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${user.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Supabase quota check failed (${r.status}).`);
  return r.json();
}

async function consumeGuestMessage(user) {
  return quotaRpc(user, 'consume_guest_message');
}

async function getGuestUsage(user) {
  return quotaRpc(user, 'get_guest_message_usage');
}

module.exports = {
  missingEnv, supabaseUrl, getUser, emailAllowed, requireUser,
  consumeGuestMessage, getGuestUsage,
};

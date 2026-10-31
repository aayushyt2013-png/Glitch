// GET /api/usage - current guest message allowance.
const { requireUser, getGuestUsage } = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only.' });
  const user = await requireUser(req, res);
  if (!user) return;
  if (!user.isAnonymous) return res.status(200).json({ guest: false, usage: null });
  try {
    const usage = await getGuestUsage(user);
    return res.status(200).json({
      guest: true,
      usage: { used: usage.used, remaining: usage.remaining, limit: usage.limit },
    });
  } catch (e) {
    return res.status(502).json({ error: e.message || 'Could not load guest usage.' });
  }
};

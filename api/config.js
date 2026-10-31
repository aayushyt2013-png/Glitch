// GET /api/config - public Supabase settings for the browser (the anon key is meant to be public;
// what it can do is limited by the row/storage policies in supabase.sql).
const { missingEnv } = require('./_lib');

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only.' });
  const missing = missingEnv();
  return res.status(200).json({
    configured: missing.length === 0,
    missing,
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    cognition: Boolean(process.env.OPENROUTER_API_KEY),
    flash: Boolean(process.env.GOOGLE_API_KEY),
  });
};

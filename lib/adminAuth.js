/**
 * Verifica la cookie admin_auth en serverless functions.
 * Uso: if (!isAdminAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
 */
export function isAdminAuthenticated(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k.trim(), v.join('=')];
    })
  );
  return cookies['admin_auth'] === process.env.ADMIN_SECRET;
}

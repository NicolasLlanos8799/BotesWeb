export default function handler(req, res) {
  res.setHeader(
    'Set-Cookie',
    'admin_auth=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'
  );
  res.writeHead(302, { Location: '/admin/login' });
  res.end();
}

import { verifySessionToken } from './lib/adminAuth.js';

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/internal/:path*'],
};

export default async function middleware(request) {
  const { pathname } = new URL(request.url);

  // Allow login page and login/logout API
  if (
    pathname === '/admin/login' ||
    pathname === '/admin/login/' ||
    pathname === '/api/admin/login' ||
    pathname === '/api/admin/logout'
  ) {
    return;
  }

  // Parse cookies manually (no Next.js dependency)
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k.trim(), v.join('=')];
    })
  );

  const secret = process.env.ADMIN_SECRET;
  const isValid = await verifySessionToken(cookies['admin_auth'], secret);

  if (!isValid) {
    return Response.redirect(new URL('/admin/login', request.url));
  }
}


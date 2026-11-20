import { state, get, route, navigate, renderNav } from './core.js';
import { home, search, status, schedule, login, register, forgot } from './pages/public.js';
import { book, pay, bookingPage, manage, trips } from './pages/booking.js';
import { profile, support, cargo } from './pages/account.js';
import { staff } from './pages/staff.js';
import { admin } from './pages/admin.js';
import { preloadAnimatedBackground } from './animated-background.js';
import { HERO_BACKGROUND } from './hero-config.js';

// Home page: start the hero image download now, in parallel with the boot API calls
// below, and reserve the page height so the footer doesn't jump when the hero renders.
if (/^#?\/?(\?.*)?$/.test(location.hash)) {
  preloadAnimatedBackground(HERO_BACKGROUND.images);
  document.getElementById('app').classList.add('bleed');
}

route('/', home, { title: 'Book flights' });
route('/search', search, { title: 'Choose flights' });
route('/book', book, { title: 'Passenger details', auth: true });
route('/pay/:pnr', pay, { title: 'Payment' });
route('/booking/:pnr', bookingPage, { title: 'Your booking' });
route('/manage', manage, { title: 'Manage booking' });
route('/trips', trips, { title: 'My trips', auth: true });
route('/status', status, { title: 'Flight status' });
route('/schedule', schedule, { title: 'Timetable' });
route('/cargo', cargo, { title: 'Cargo' });
route('/support', support, { title: 'Help', auth: true });
route('/support/:ref', support, { title: 'Support request', auth: true });
route('/profile', profile, { title: 'My profile', auth: true });
route('/login', login, { title: 'Sign in' });
route('/forgot', forgot, { title: 'Reset password' });
route('/register', register, { title: 'Register' });
route('/staff', staff, { title: 'Staff portal', auth: true, roles: ['staff', 'admin'] });
route('/staff/:tab', staff, { title: 'Staff portal', auth: true, roles: ['staff', 'admin'] });
route('/staff/:tab/:id', staff, { title: 'Staff portal', auth: true, roles: ['staff', 'admin'] });
route('/admin', admin, { title: 'Administration', auth: true, roles: ['admin'] });
route('/admin/:tab', admin, { title: 'Administration', auth: true, roles: ['admin'] });

async function boot() {
  const [me, ap] = await Promise.all([get('/api/auth/me'), get('/api/flights/airports')]);
  state.user = me.user;
  state.airports = ap.airports;
  state.airportMap = Object.fromEntries(ap.airports.map((a) => [a.code, a]));
  renderNav();

  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('nav');
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  window.addEventListener('hashchange', () => {
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    navigate();
  });
  navigate();
}

boot().catch((e) => {
  document.getElementById('app').innerHTML = `<div class="card error-box">Could not reach the server: ${e.message}</div>`;
});

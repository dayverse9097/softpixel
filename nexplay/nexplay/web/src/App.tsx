import { MotionConfig } from 'framer-motion';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AdminLayout, AdminRoot, RequireAdmin } from './admin/AdminLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PublicLayout } from './components/Layout';
import { Spinner } from './components/States';
import { DiscoverPage } from './pages/Discover';
import { FavoritesPage } from './pages/Favorites';
import { GameDetailPage } from './pages/GameDetail';
import { HomePage } from './pages/Home';
import { NotFoundPage } from './pages/NotFound';
import { PlayPage } from './pages/Play';
import { AboutPage, ContactPage, PrivacyPage, TermsPage } from './pages/StaticPages';

// The admin screens are only downloaded when an administrator opens them, which keeps the public site light.
const LoginPage = lazy(() => import('./admin/Login').then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('./admin/Dashboard').then((m) => ({ default: m.DashboardPage })));
const GameEditorPage = lazy(() => import('./admin/GameEditor').then((m) => ({ default: m.GameEditorPage })));
const SecurityPage = lazy(() => import('./admin/Security').then((m) => ({ default: m.SecurityPage })));
const AuditPage = lazy(() => import('./admin/Audit').then((m) => ({ default: m.AuditPage })));

export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {/* "user" turns animations down or off for visitors who ask their device for less motion */}
      <MotionConfig reducedMotion="user">
        <ErrorBoundary>
          <Suspense fallback={<Spinner label="Loading" />}>
            <Routes>
              <Route element={<PublicLayout />}>
                <Route index element={<HomePage />} />
                <Route path="discover" element={<DiscoverPage />} />
                <Route path="game/:slug" element={<GameDetailPage />} />
                <Route path="play/:slug" element={<PlayPage />} />
                <Route path="favorites" element={<FavoritesPage />} />
                <Route path="about" element={<AboutPage />} />
                <Route path="contact" element={<ContactPage />} />
                <Route path="privacy" element={<PrivacyPage />} />
                <Route path="terms" element={<TermsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
              <Route path="admin" element={<AdminRoot />}>
                <Route path="login" element={<LoginPage />} />
                <Route element={<RequireAdmin />}>
                  <Route element={<AdminLayout />}>
                    <Route index element={<DashboardPage />} />
                    <Route path="games/new" element={<GameEditorPage />} />
                    <Route path="games/:id" element={<GameEditorPage />} />
                    <Route path="security" element={<SecurityPage />} />
                    <Route path="audit" element={<AuditPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Route>
              </Route>
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </MotionConfig>
    </BrowserRouter>
  );
}

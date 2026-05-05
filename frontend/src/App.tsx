import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useNavigate
} from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthPage } from './pages/AuthPage';
import { CatalogPage } from './pages/CatalogPage';
import { MyRentalsPage } from './pages/MyRentalsPage';
import { StaffPage } from './pages/StaffPage';
import { UserRole } from './types';
import './styles/App.css';

function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <nav className="navbar">
      <Link to="/" className="brand">Wine Rental Service</Link>
      <div className="nav-links">
        <Link to="/catalog">Catalog</Link>
        {user.role === 'customer' && <Link to="/my-rentals">My rentals</Link>}
        {user.role === 'concierge' && <Link to="/staff">Staff</Link>}
        <span className="user-pill">
          {user.email} ({user.role})
        </span>
        <button onClick={() => { logout(); navigate('/'); }}>Sign out</button>
      </div>
    </nav>
  );
}

function ProtectedRoute({
  children,
  roles
}: {
  children: JSX.Element;
  roles?: UserRole[];
}) {
  const { user, loading } = useAuth();
  if (loading) return <p>Loading...</p>;
  if (!user) return <Navigate to="/" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/catalog" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) return <p>Loading...</p>;

  return (
    <>
      <NavBar />
      <main className="main-content">
        <Routes>
          <Route
            path="/"
            element={
              user ? (
                <Navigate
                  to={user.role === 'concierge' ? '/staff' : '/catalog'}
                  replace
                />
              ) : (
                <AuthPage
                  onAuthenticated={(role) =>
                    navigate(role === 'concierge' ? '/staff' : '/catalog')
                  }
                />
              )
            }
          />
          <Route
            path="/catalog"
            element={
              <ProtectedRoute>
                <CatalogPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-rentals"
            element={
              <ProtectedRoute roles={['customer']}>
                <MyRentalsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff"
            element={
              <ProtectedRoute roles={['concierge']}>
                <StaffPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

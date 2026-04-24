import { Navigate, Outlet } from 'react-router-dom';

interface ProtectedRouteProps {
  /** Lista de roles permitidos. Si está vacía o undefined, solo requiere autenticación. */
  allowedRoles?: string[];
}

export default function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const token    = localStorage.getItem('token');
  const userRole = (localStorage.getItem('user_role') || '').toUpperCase().trim();

  // Sin token → redirigir a login
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Si se especificaron roles y el usuario no tiene ninguno → redirigir a inicio
  if (allowedRoles && allowedRoles.length > 0) {
    const normalizedAllowed = allowedRoles.map(r => r.toUpperCase().trim());
    if (!normalizedAllowed.includes(userRole)) {
      return <Navigate to="/" replace />;
    }
  }

  // Autenticado y con rol válido → renderizar la ruta protegida
  return <Outlet />;
}

import { useAuth } from './useAuth';

export type UserRole = 'admin' | 'cashier';

export function useRole() {
  const { user, loading } = useAuth();
  const role = (user?.role ?? null) as UserRole | null;

  const hasRole = (requiredRole: UserRole): boolean => {
    return role === requiredRole;
  };

  return {
    role,
    loading,
    hasRole,
    isAdmin: role === 'admin',
    isCashier: role === 'cashier'
  };
}

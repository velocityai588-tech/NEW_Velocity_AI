import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireSupabaseAuth?: boolean;
}

export const ProtectedRoute = ({ children, requireSupabaseAuth = false }: ProtectedRouteProps) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1C1917] mx-auto mb-4"></div>
          <p className="text-[#78716C]">Loading...</p>
        </div>
      </div>
    );
  }

  // All protected routes now require Supabase auth (same for all users - Email, Google, Jira)
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

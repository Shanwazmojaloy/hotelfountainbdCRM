'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserRole, RolePermissions, AppUser } from '@/types';
import { getPermissions, getRoleLabel } from '@/lib/roles';

interface RoleContextValue {
  user: AppUser | null;
  role: UserRole;
  permissions: RolePermissions;
  roleLabel: string;
  setRole: (role: UserRole) => void;
  isHardwareAuthorized: boolean;
  isReadOnly: boolean;
}

const DEFAULT_ROLE: UserRole = 'front_desk_sales_lead';

const RoleContext = createContext<RoleContextValue>({
  user: null,
  role: DEFAULT_ROLE,
  permissions: getPermissions(DEFAULT_ROLE),
  roleLabel: getRoleLabel(DEFAULT_ROLE),
  setRole: () => {},
  isHardwareAuthorized: true,
  isReadOnly: false,
});

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<UserRole>(DEFAULT_ROLE);
  // Device/hardware lock removed (2026-06-18) — always authorized, no read-only gate.
  const [isHardwareAuthorized] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('crm_role') as UserRole | null;
      if (stored && ['admin', 'manager', 'front_office', 'front_desk_sales_lead'].includes(stored)) {
        setRoleState(stored);
      }
    } catch {}
  }, []);

  const setRole = useCallback((newRole: UserRole) => {
    setRoleState(newRole);
    try { localStorage.setItem('crm_role', newRole); } catch {}
  }, []);

  const permissions = getPermissions(role);
  const isReadOnly = !isHardwareAuthorized || permissions.isReadOnly;

  const user: AppUser = {
    name: 'Demo User',
    email: 'demo@hotelfountainbd.com',
    role,
    is_active: true,
  };

  return (
    <RoleContext.Provider value={{ user, role, permissions, roleLabel: getRoleLabel(role), setRole, isHardwareAuthorized, isReadOnly }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole(): RoleContextValue {
  return useContext(RoleContext);
}

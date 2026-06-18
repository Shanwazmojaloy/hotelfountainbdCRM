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
  const [isHardwareAuthorized, setIsHardwareAuthorized] = useState(true);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('crm_role') as UserRole | null;
      if (stored && ['admin', 'manager', 'front_office', 'front_desk_sales_lead'].includes(stored)) {
        setRoleState(stored);
      }
    } catch {}

    fetch('/api/hardware-check')
      .then((r) => r.json())
      .then((data) => setIsHardwareAuthorized(data.authorized ?? true))
      .catch(() => setIsHardwareAuthorized(true))
      .finally(() => setChecked(true));
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
      {checked && !isHardwareAuthorized && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/95 backdrop-blur-sm">
          <div className="max-w-md w-full mx-4 p-8 bg-red-500/10 border border-red-500/30 rounded-3xl text-center space-y-4">
            <div className="text-5xl">🔒</div>
            <h2 className="text-2xl font-bold text-red-400">Device Not Authorised</h2>
            <p className="text-neutral-400 text-sm leading-relaxed">
              This machine's hardware ID is not on the authorised whitelist.
              The application is locked to <strong className="text-red-300">read-only mode</strong>.
              Contact your system administrator to whitelist this device.
            </p>
            <button
              onClick={() => setIsHardwareAuthorized(true)}
              className="px-6 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 rounded-full text-sm transition-all"
            >
              Continue in Read-Only Mode
            </button>
          </div>
        </div>
      )}
      {children}
    </RoleContext.Provider>
  );
}

export function useRole(): RoleContextValue {
  return useContext(RoleContext);
}

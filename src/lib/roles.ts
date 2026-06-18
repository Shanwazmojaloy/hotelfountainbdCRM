import { UserRole, RolePermissions } from '@/types';

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  admin: {
    canViewFinancials: true,
    canViewStaffManagement: true,
    canViewGeneralSettings: true,
    canViewAIAgents: true,
    canViewB2BPartners: true,
    canViewFrontDeskSales: true,
    canConfirmReservations: true,
    canAssignRooms: true,
    isReadOnly: false,
  },
  manager: {
    canViewFinancials: true,
    canViewStaffManagement: true,
    canViewGeneralSettings: false,
    canViewAIAgents: true,
    canViewB2BPartners: true,
    canViewFrontDeskSales: true,
    canConfirmReservations: true,
    canAssignRooms: true,
    isReadOnly: false,
  },
  front_office: {
    canViewFinancials: false,
    canViewStaffManagement: false,
    canViewGeneralSettings: false,
    canViewAIAgents: false,
    canViewB2BPartners: false,
    canViewFrontDeskSales: true,
    canConfirmReservations: true,
    canAssignRooms: true,
    isReadOnly: false,
  },
  // Front Desk – Sales Lead: AI Agents + B2B Partners ONLY
  front_desk_sales_lead: {
    canViewFinancials: false,
    canViewStaffManagement: false,
    canViewGeneralSettings: false,
    canViewAIAgents: true,
    canViewB2BPartners: true,
    canViewFrontDeskSales: false,
    canConfirmReservations: false,
    canAssignRooms: false,
    isReadOnly: false,
  },
};

export function getPermissions(role: UserRole): RolePermissions {
  return ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.front_desk_sales_lead;
}

export function getRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    admin: 'Administrator',
    manager: 'Manager',
    front_office: 'Front Office',
    front_desk_sales_lead: 'Front Desk – Sales Lead',
  };
  return labels[role] ?? role;
}

export interface SettingsTab {
  key: string;
  label: string;
  permission: keyof RolePermissions;
  icon: string;
}

export const SETTINGS_TABS: SettingsTab[] = [
  { key: 'ai_agents',    label: 'AI Agents',               permission: 'canViewAIAgents',        icon: '🤖' },
  { key: 'b2b_partners', label: 'B2B Partners',            permission: 'canViewB2BPartners',     icon: '🤝' },
  { key: 'front_desk',   label: 'Front Desk & Sales',      permission: 'canViewFrontDeskSales',  icon: '🏨' },
  { key: 'financials',   label: 'Financials',              permission: 'canViewFinancials',      icon: '💰' },
  { key: 'staff',        label: 'Staff Management',        permission: 'canViewStaffManagement', icon: '👥' },
  { key: 'general',      label: 'General System Settings', permission: 'canViewGeneralSettings', icon: '⚙️' },
];

export function getVisibleTabs(role: UserRole): SettingsTab[] {
  const perms = getPermissions(role);
  return SETTINGS_TABS.filter((tab) => perms[tab.permission] === true);
}

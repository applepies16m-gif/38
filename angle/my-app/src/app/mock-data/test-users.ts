// Phase 1 test personas -- fake auth, just enough to demo every
// role/group-membership combination without a real account system
// yet. Not used anywhere in Phase 2 once real auth exists.
export interface TestUser {
  password: string;
  role: 'super_admin' | 'group_admin' | 'user';
  hasGroups: boolean; // false = "New User", sees no chat rooms yet
}

export const TEST_USERS: Record<string, TestUser> = {
  superadmin: { password: 'Super123', role: 'super_admin', hasGroups: false },
  groupadmin: { password: 'Group123', role: 'group_admin', hasGroups: true },
  newuser: { password: 'NewUser123', role: 'user', hasGroups: false },
  member: { password: 'Member123', role: 'user', hasGroups: true }
};
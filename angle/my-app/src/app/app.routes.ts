import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { ChatShellComponent } from './components/chat-shell/chat-shell.component';
import { AdminPanelComponent } from './components/admin-panel/admin-panel.component';
import { GroupAdminComponent } from './components/group-admin/group-admin.component';
import { GroupRequestComponent } from './components/group-request/group-request.component';
import { ProfileComponent } from './components/profile/profile.component';
import { RegisterComponent } from './components/register/register.component';
import { BootstrapComponent } from './components/bootstrap/bootstrap.component';
import { BrowseGroupsComponent } from './components/browse-groups/browse-groups.component';
import { NotificationsComponent } from './components/notifications/notifications.component';
import { AuditLogComponent } from './components/audit-log/audit-log.component';

// Each route has a title. Angular puts it in the browser tab, and a
// screen reader announces it when the page changes.
export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent, title: 'Fabulari - Log In' },
  { path: 'chat', component: ChatShellComponent, title: 'Fabulari - Chat' },
  { path: 'admin', component: AdminPanelComponent, title: 'Fabulari - Admin Panel' },
  { path: 'group-admin', component: GroupAdminComponent, title: 'Fabulari - Manage Group' },
  { path: 'group-request', component: GroupRequestComponent, title: 'Fabulari - Request a Group' },
  { path: 'profile', component: ProfileComponent, title: 'Fabulari - My Profile' },
  { path: 'register', component: RegisterComponent, title: 'Fabulari - Register' },
  { path: 'bootstrap', component: BootstrapComponent, title: 'Fabulari - First-Time Setup' },
  { path: 'browse-groups', component: BrowseGroupsComponent, title: 'Fabulari - Browse Groups' },
  { path: 'notifications', component: NotificationsComponent, title: 'Fabulari - Notifications' },
  { path: 'audit-log', component: AuditLogComponent, title: 'Fabulari - Audit Log' },
];

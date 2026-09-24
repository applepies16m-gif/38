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

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'chat', component: ChatShellComponent },
  { path: 'admin', component: AdminPanelComponent },
  { path: 'group-admin', component: GroupAdminComponent },
  { path: 'group-request', component: GroupRequestComponent },
  { path: 'profile', component: ProfileComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'bootstrap', component: BootstrapComponent },
  { path: 'browse-groups', component: BrowseGroupsComponent },
];
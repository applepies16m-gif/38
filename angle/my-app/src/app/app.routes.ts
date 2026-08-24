import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { ChatShellComponent } from './components/chat-shell/chat-shell.component';
import { AdminPanelComponent } from './components/admin-panel/admin-panel.component';
import { GroupAdminComponent } from './components/group-admin/group-admin.component';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'chat', component: ChatShellComponent },
  { path: 'admin', component: AdminPanelComponent },
  { path: 'group-admin', component: GroupAdminComponent },
];
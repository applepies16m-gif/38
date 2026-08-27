# Fabulari — Phase 1 Documentation

**Student Name:** Anthony Quizon
**Student Number:** S5353244
**Workshop Time:** [FILL IN — add your workshop time]
**Course:** 3813ICT — Full Stack Development
**GitHub Repository:** https://github.com/applepies16m-gif/38

---

## 1. Overview

Fabulari is a full stack real-time chat application built on the MEAN stack (MongoDB, Express, Angular, Node.js), with real-time messaging planned via Socket.io in Phase 2. The application allows users to communicate through text and image messages inside topic-based groups and channels, with three distinct permission levels:

- **User** — a regular member who can request to join groups, chat inside groups they belong to, and manage their own profile.
- **Group Admin** — manages one or more individual groups: approves/rejects join requests and room requests, manages members (promote/demote/ban), and edits group settings (title, description, age limit, theme).
- **Super Admin** — manages the system as a whole: approves new-group requests (the requester becomes that group's admin), bans users from the entire system, and does **not** participate in chat or have access to chat history.

This document covers the Phase 1 deliverable: requirements elicitation, design, and an early UI prototype demonstrating the interface for each permission level, backed by basic user management persisted to a JSON file on the server.

---

## 2. Git Strategy

This project uses Git for version control, hosted on GitHub, with the teaching team added as a collaborator on a private repository.

**Branching approach:**
- `main` — always holds a working, demoable version of the application. Nothing broken is merged here directly.
- Feature branches (e.g. `feature/login`, `feature/group-admin`, `feature/json-backend`) — one per component or feature, merged into `main` once working and tested locally.
- Commits are made at meaningful checkpoints (a working component, a fixed bug, a completed feature slice) rather than in one large end-of-session dump, so the commit history reflects genuine incremental progress across the development period.

**Commit message convention:** short, present-tense descriptions of what changed (e.g. `add group-admin join request approval`, `fix chat-shell duplicate top-bar links`), making the history readable as a change log during marking.

---

## 3. Requirements & Assumptions

Requirements below are drawn from the assignment brief, the supplementary client specification document, and clarifications gathered during the Week 2 client briefing and follow-up Q&A.

### 3.1 Functional Requirements

| # | Requirement | Source | Phase |
|---|---|---|---|
| 1 | Users log in with a username and password (basic auth) | Brief | 1 |
| 2 | Three permission levels: User, Group Admin, Super Admin, each with a distinct UI | Client spec | 1 |
| 3 | Users, Groups, Channels can be created and persistently stored in a JSON file on the server | Brief | 1 |
| 4 | On registration, a new user has no group memberships and sees a list of all existing groups | Client spec | 1 (UI) / 2 (full) |
| 5 | Users cannot join a group directly — they submit a join request, which a Group Admin approves or rejects (with a reason if rejected) | Client spec | 1 (UI) / 2 (full) |
| 6 | Users can request a new group from the Super Admin; on approval, the requester becomes that group's admin | Client meeting | 1 |
| 7 | Every group must always have at least one admin; the last admin cannot leave/delete their account without appointing a successor | Client meeting | 1 |
| 8 | A user can be an admin of multiple groups | Client meeting | 1 (data model) |
| 9 | Group Admins can create/remove chat rooms (channels) within their group, subject to admin approval if requested by a regular member | Client meeting | 2 |
| 10 | Users see an old-style "X has joined/left the room" message, visible only to members of that group | Client meeting | 1 |
| 11 | On entering a chat room, only the last 5 messages are shown/stored | Client meeting | 1 (UI) / 2 (storage) |
| 12 | Messages support text, images, GIFs and PNG/JPEG — no voice or video | Client meeting | 2 |
| 13 | Maximum file size for message attachments: 2MB | Client meeting | 2 |
| 14 | Users can delete their own sent messages (not edit them) | Client meeting | 2 |
| 15 | An online/offline indicator (green/grey) is shown per user | Client meeting | 1 |
| 16 | Group Admins can ban a member from their group; Super Admin can ban a user from the entire system | Client spec | 1 (UI) / 2 (enforced) |
| 17 | Group Admins can only be removed/banned via a request from another Group Admin, reviewed by the Super Admin | Client meeting | 2 |
| 18 | Users can message their Group Admin to request another member be removed/banned, with a reason (message queue) | Client meeting | 2 |
| 19 | All admin actions (bans, approvals, rejections) are recorded in an audit log, visible to the Super Admin | Client meeting | 2 |
| 20 | Super Admin does not use chat functions and has no access to chat history | Client spec | 1 |
| 21 | Groups have a title (max 30 characters), a description (max 250 characters), and an optional age limit | Client spec | 1 |
| 22 | If a group has an age limit, a user below that age is notified and cannot join | Client meeting | 2 |
| 23 | Users have a private profile: name, username, email (locked after registration), password, and an optional profile picture | Client spec | 1 (UI) / 2 (upload) |
| 24 | Other users cannot view another user's profile page | Client meeting | 2 |
| 25 | Users can change their username and password (old + new, for verification), but not their email | Client meeting | 2 |
| 26 | Passwords must be at least 8 characters and contain at least one uppercase letter | Client meeting | 1 (validated client-side) |
| 27 | Passwords are hashed before storage (e.g. bcrypt) | Client meeting | 2 |
| 28 | On first server startup, a bootstrap process creates an initial Super Admin account, then disables itself | Client meeting | 2 |
| 29 | Super Admin can send one-way notifications to users | Client meeting | 2 |
| 30 | A group's chat background/theme can be customised by its admin | Client spec | 2 |
| 31 | User-blocking and reporting is a required feature | Client meeting | 2 |

### 3.2 Non-Functional / Scope Assumptions

| # | Assumption | Notes |
|---|---|---|
| 1 | No automatic content censoring/moderation is implemented | Explicitly out of scope per client |
| 2 | No OAuth — simple username/password only | Explicitly stated by client |
| 3 | URLs in messages are not rendered as clickable hyperlinks | Explicitly stated by client |
| 4 | No reply-to-specific-message functionality | Explicitly stated by client |
| 5 | No group-message push notifications | Explicitly stated by client |
| 6 | No multi-language support | Explicitly stated by client |
| 7 | No limit on how many groups a single user can belong to | Explicitly stated by client |
| 8 | No text length limit on messages | Explicitly stated by client |
| 9 | Display only needs to support tablet and desktop widths, not mobile phone | Explicitly stated by client |
| 10 | CSS frameworks are permitted for use | Explicitly stated by client |
| 11 | Communication must use HTTPS in the final (Phase 2) submission | Explicitly stated by client |
| 12 | Phase 2 will use MongoDB; Phase 1 uses a JSON file on the server | Brief + client |
| 13 | Phase 1 focuses on frontend UI; backend in Phase 1 is limited to basic user management | Brief |

---

## 4. Data Structures

The application's core entities and their relationships, implemented as TypeScript interfaces on the frontend (mirrored by the JSON file structure on the server).

### User
```ts
interface User {
  id: string;
  username: string;        // changeable
  password?: string;       // optional on the client type (never returned
                            // by the login endpoint); stored in plain
                            // text in the Phase 1 JSON file — hashing is
                            // a Phase 2 item
  displayName: string;
  email: string;           // locked after registration
  role: 'super_admin' | 'group_admin' | 'user';
  online: boolean;
  groupIds: string[];              // groups this user has been approved into
  bannedFromGroupIds: string[];    // group-level bans (permanent, per group)
  isSystemBanned: boolean;         // system-wide ban, Super Admin only
}
```

### Group / Channel
```ts
interface Group {
  id: string;
  title: string;           // max 30 characters
  description: string;     // max 250 characters
  ageLimit: number;        // 0 = no restriction
  adminIds: string[];      // must always contain at least one id
  channelIds: string[];
  theme?: string;          // optional background/theme
}

interface Channel {
  id: string;
  name: string;
  groupId: string;
}
```

### Request workflows
Join requests, room requests, and group-creation requests are each modelled as their own entity with a `status` field, rather than as booleans, because each carries additional context (who requested it, an optional rejection reason) that a simple flag cannot represent.

```ts
interface JoinRequest {
  id: string;
  userId: string;
  groupId: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
}

interface RoomRequest {
  id: string;
  requestedBy: string;
  groupId: string;
  roomName: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
}

interface GroupCreationRequest {
  id: string;
  requestedBy: string;     // becomes the group's admin once approved
  proposedTitle: string;
  proposedDescription: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
}
```

### Messages
```ts
interface ChatMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;      // denormalised for simpler rendering
  text: string;
  imageUrl?: string;
  timestamp: string;
}

interface SystemMessage {
  id: string;
  channelId: string;
  type: 'join' | 'leave';
  username: string;
  timestamp: string;
}
```
`SystemMessage` is kept as a separate interface from `ChatMessage` rather than a flag on the same type, since a join/leave event has a genuinely different shape (no sender bubble, no text body) — this lets the UI render each kind distinctly and lets TypeScript catch any accidental misuse.

---

## 5. Proposed Angular Architecture

### Components (standalone, Angular 20+)
| Component | Route | Purpose |
|---|---|---|
| `LoginComponent` | `/login` | Username/password entry, basic client-side validation |
| `RegisterComponent` | `/register` | Account creation (name, username, email, password) |
| `ChatShellComponent` | `/chat` | Main chat UI: groups/channels sidebar, message thread, online users |
| `GroupAdminComponent` | `/group-admin` | Join/room request approval, member management, group settings |
| `AdminPanelComponent` | `/admin` | Super Admin hub: user management, group-request approval, system bans |
| `GroupRequestComponent` | `/group-request` | Any user requests a new group from the Super Admin |
| `BrowseGroupsComponent` (planned) | `/browse-groups` | Search and request to join existing groups |
| `ProfileComponent` (planned) | `/profile` | View/edit own profile, upload picture |

### Services
| Service | Purpose |
|---|---|
| `UserService` | HTTP calls to `/api/users` (get, create, delete) and `/api/login` (real credential check against the JSON file) |
| `GroupService` | HTTP calls to `/api/groups` (get, create) |
| `AuthService` | Tracks in-memory logged-in state (`login()`/`logout()`/`isLoggedIn()`), separate from the role/username carried in the URL's query params. This closes a real gap: query params alone persist in browser history, so relying on them exclusively would let someone press "Back" after logging out and land back on a protected page. `isLoggedIn()` does not, since it resets to `false` on logout regardless of URL history. |

### Models
`User`, `Group`, `Channel`, `JoinRequest`, `RoomRequest`, `GroupCreationRequest`, `ChatMessage`, `SystemMessage` — see Section 4.

### Routing
Each protected component performs a two-part check in `ngOnInit()`, matching the pattern taught in class (an `ngOnInit`-based check rather than a `CanActivateFn` route guard):

1. **Authentication check** — `AuthService.isLoggedIn()` must be `true`, or the user is redirected to `/login`. This is real, in-memory state set on a successful `/api/login` call and cleared on logout — not just a value parsed out of the URL.
2. **Role check** — the role carried in the URL's query params (set at login, after the real credential check) is compared against what that route allows, e.g. `AdminPanelComponent` only allows `super_admin`; `GroupAdminComponent` allows `group_admin` and `super_admin`; `ChatShellComponent` and `ProfileComponent` explicitly redirect `super_admin` away, since Super Admin does not use chat or profile functions per the client spec.

Login itself (`LoginComponent`) now calls `UserService.login(username, password)`, which POSTs to `/api/login` and checks the submitted credentials against the real JSON file on the server — this is genuine authentication against persisted data, not a hardcoded list, though passwords are still stored and compared in plain text (hashing is a documented Phase 2 item, see Section 8).

---

## 6. Proposed Server Endpoints

Phase 1 implements basic user management only, per the brief. The remainder are proposed for Phase 2.

| Method | Endpoint | Purpose | Status |
|---|---|---|---|
| GET | `/api/users` | List all users | Implemented (Phase 1) |
| POST | `/api/users` | Create a user | Implemented (Phase 1) |
| DELETE | `/api/users/:id` | Remove a user | Implemented (Phase 1) |
| GET | `/api/groups` | List all groups | Proposed |
| POST | `/api/groups` | Create a group | Proposed |
| PUT | `/api/groups/:id` | Update group settings | Proposed |
| POST | `/api/groups/:id/join-requests` | Submit a join request | Proposed |
| PUT | `/api/join-requests/:id` | Approve/reject a join request | Proposed |
| POST | `/api/groups/:id/room-requests` | Request a new channel | Proposed |
| PUT | `/api/room-requests/:id` | Approve/reject a room request | Proposed |
| POST | `/api/group-requests` | Request a new group | Proposed |
| PUT | `/api/group-requests/:id` | Approve/reject a group request | Proposed |
| GET/POST | `/api/channels/:id/messages` | Read/send messages (last 5 only) | Proposed (Phase 2, with Socket.io) |
| DELETE | `/api/messages/:id` | Delete own message | Proposed (Phase 2) |
| POST | `/api/login` | Check username/password against the JSON file; returns the user (password stripped) or 401 | Implemented (Phase 1) |
| POST | `/api/auth/register` | Real registration, password hashing | Proposed (Phase 2) |
| GET | `/api/audit-log` | Super Admin audit log, filterable | Proposed (Phase 2) |

---

## 7. Design Documents

### Visual design direction
The UI deliberately adopts an early-2000s social-network aesthetic (comparable to early Facebook/MySpace): Verdana typography, boxy panels with light-blue borders, a solid blue-chrome header, underlined blue links, and beveled buttons — rather than a contemporary flat design. This was a deliberate styling choice, not a default, and is easy to justify as a design decision in the marking interview.

### Layout structure (desktop/tablet only, per client scope assumption)
- **Login / Register:** centred panel over a two-column layout (pitch text + form) on desktop, collapsing to a single column via `flex-wrap` on narrower widths.
- **Chat Shell:** three-column layout — groups/channels sidebar (left, fixed width), message thread (centre, flexible), online users list (right, fixed width). All three columns sit under a shared top navigation bar.
- **Admin/Group Admin panels:** single-column, centred, max-width layout using stacked panels (tables + forms), appropriate for their more data-dense, form-heavy content.

### Responsive behaviour
Column layouts use CSS Flexbox with `flex-wrap` so that on narrower (tablet) widths, columns can stack rather than overflow, satisfying the brief's requirement for a responsive design methodology without requiring separate mobile layouts (explicitly out of scope per the client).

### Storyboards
[Insert screenshots here of: Login, Register, Chat Shell (User view), Chat Shell (empty-state for a new user with no groups), Group Admin dashboard, Super Admin panel, Group Request page — one per permission level/state, annotated with brief captions describing the user's role and what they can do from that screen.]

---

## 8. Known Phase 1 Limitations (by design)

The following are intentionally not implemented in Phase 1 and are documented here rather than built, per the brief's allowance for mock data and incomplete functionality:

- Login is now checked for real against the JSON file (`POST /api/login`), and both Users and Groups persist through the backend (`GET`/`POST /api/users`, `GET`/`POST /api/groups`) — this exceeds the brief's minimum "basic user management" requirement for Phase 1. What is **not** yet real: passwords are stored and compared in plain text (no hashing/bcrypt yet), there is no session/token beyond the in-memory `AuthService` flag (a hard refresh currently loses the logged-in state, since nothing persists it to `localStorage`, a cookie, or a server-side session), and there is no registration endpoint — accounts are currently created only via the Admin Panel's "Request New User" form, not self-service sign-up.
- Channels themselves are still mock data — only Users and Groups are backend-persisted so far.
- No real-time messaging (Socket.io) yet — messages are appended to a local array and do not sync across users.
- No file upload pipeline, size limits, or GIF/image handling yet.
- No message-queue/notification system, audit log, or ban enforcement beyond local UI state (bans update local state but are not checked against on subsequent logins).
- Group join requests (`requestToJoin()` in the Chat Shell) are a UI stub — clicking it shows a confirmation message but does not create a real `JoinRequest` record yet.
- Profile picture upload is a client-side preview only (`FileReader`) — nothing is sent to or stored on the server yet.

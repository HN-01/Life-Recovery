# Security Specification — PROJECT REBUILD ME

## 1. Data Invariants
1. Every document in Firestore belongs strictly to a single Firebase Auth user via both path scoping (`/users/{userId}/...`) and document ownership field (`uid == request.auth.uid`).
2. Unauthenticated requests (`request.auth == null`) are unconditionally denied across all paths.
3. No user may read, list, create, update, or delete any document under another user's `{userId}` path.
4. All document IDs (`userId`, `dayDate`, `habitId`, `goalId`, `projectId`, `weekId`, `conversationId`) must match `^[a-zA-Z0-9_\-]+$` and be at most 128 characters.
5. Every string field enforces strict `.size()` bounds; every array enforces `.size()` limits to prevent resource exhaustion attacks.
6. Every document creation enforces `keys().hasAll(...) && keys().hasOnly(...)` and every update enforces `isValid[Entity](incoming())`, immutable `uid`, and explicit `affectedKeys().hasOnly(...)`.

## 2. Adversarial ("Dirty Dozen") Payloads Tested Against Rules
1. Unauthenticated read of `/users/userA/private/profile` -> PERMISSION_DENIED.
2. Cross-user read by `userB` on `/users/userA/days/2026-11-15` -> PERMISSION_DENIED.
3. Cross-user list by `userB` on `/users/userA/habits` -> PERMISSION_DENIED.
4. Ownership spoofing on create: `userB` creates `/users/userB/habits/h1` with `uid: "userA"` -> PERMISSION_DENIED.
5. Shadow field injection on create: `userA` creates `/users/userA/goals/g1` with extra field `isAdmin: true` -> PERMISSION_DENIED.
6. Shadow field injection on update: `userA` updates `/users/userA/private/profile` with extra `role: "admin"` -> PERMISSION_DENIED.
7. Mutating immutable `uid` on update: `userA` updates `/users/userA/projects/p1` changing `uid` to `"userB"` -> PERMISSION_DENIED.
8. Oversized string attack: `userA` sets `title` > 240 chars on `/users/userA/habits/h1` -> PERMISSION_DENIED.
9. Path ID poisoning: `userA` writes to `/users/userA/goals/bad$id!with*chars` -> PERMISSION_DENIED.
10. Invalid enum value: `userA` sets `scheduleType: "invalid_mode"` on `/users/userA/days/2026-11-15` -> PERMISSION_DENIED.
11. Unbounded array attack: `userA` sends 500 tasks in a single day document (> 100 cap) -> PERMISSION_DENIED.
12. Root collection probe: `userA` attempts read/write on `/admins/userA` or `/test/connection` -> PERMISSION_DENIED.

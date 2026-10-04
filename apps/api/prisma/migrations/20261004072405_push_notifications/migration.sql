-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSuccessAt" DATETIME,
    CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "dueDate" TEXT,
    "recurrenceEvery" INTEGER,
    "recurrenceUnit" TEXT,
    "recurrenceMode" TEXT,
    "seasonFrom" INTEGER,
    "seasonTo" INTEGER,
    "notify" BOOLEAN NOT NULL DEFAULT false,
    "notifiedFor" TEXT,
    "doneAt" DATETIME,
    "archivedAt" DATETIME,
    "createdById" INTEGER NOT NULL,
    "createdVia" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("archivedAt", "createdAt", "createdById", "createdVia", "doneAt", "dueDate", "id", "notes", "priority", "recurrenceEvery", "recurrenceMode", "recurrenceUnit", "seasonFrom", "seasonTo", "title", "updatedAt") SELECT "archivedAt", "createdAt", "createdById", "createdVia", "doneAt", "dueDate", "id", "notes", "priority", "recurrenceEvery", "recurrenceMode", "recurrenceUnit", "seasonFrom", "seasonTo", "title", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_archivedAt_doneAt_dueDate_idx" ON "Task"("archivedAt", "doneAt", "dueDate");
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "digestEnabled" BOOLEAN NOT NULL DEFAULT true,
    "notifyTime" TEXT NOT NULL DEFAULT '08:00',
    "notifyRunOn" TEXT
);
INSERT INTO "new_User" ("createdAt", "displayName", "email", "id", "updatedAt", "username") SELECT "createdAt", "displayName", "email", "id", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

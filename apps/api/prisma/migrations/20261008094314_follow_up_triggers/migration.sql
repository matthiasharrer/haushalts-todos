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
    "triggerRefire" TEXT,
    "hookTokenHash" TEXT,
    "firedAt" DATETIME,
    "afterTaskId" INTEGER,
    "afterHours" INTEGER,
    "fireAt" DATETIME,
    "fireAtCompletionId" INTEGER,
    "doneAt" DATETIME,
    "archivedAt" DATETIME,
    "createdById" INTEGER NOT NULL,
    "createdVia" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_afterTaskId_fkey" FOREIGN KEY ("afterTaskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("archivedAt", "createdAt", "createdById", "createdVia", "doneAt", "dueDate", "firedAt", "hookTokenHash", "id", "notes", "notifiedFor", "notify", "priority", "recurrenceEvery", "recurrenceMode", "recurrenceUnit", "seasonFrom", "seasonTo", "title", "triggerRefire", "updatedAt") SELECT "archivedAt", "createdAt", "createdById", "createdVia", "doneAt", "dueDate", "firedAt", "hookTokenHash", "id", "notes", "notifiedFor", "notify", "priority", "recurrenceEvery", "recurrenceMode", "recurrenceUnit", "seasonFrom", "seasonTo", "title", "triggerRefire", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_archivedAt_doneAt_dueDate_idx" ON "Task"("archivedAt", "doneAt", "dueDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

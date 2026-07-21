CREATE TYPE "GoalMovementType" AS ENUM ('OPENING_BALANCE', 'CONTRIBUTION', 'WITHDRAWAL');

CREATE TABLE "GoalMovement" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "accountId" TEXT,
    "type" "GoalMovementType" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "movementDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoalMovement_pkey" PRIMARY KEY ("id")
);

INSERT INTO "GoalMovement" ("id", "goalId", "accountId", "type", "amount", "movementDate", "notes", "createdAt")
SELECT 'opening_' || "id", "id", "linkedAccountId", 'OPENING_BALANCE'::"GoalMovementType", "currentAmount", "createdAt", 'Opening progress carried forward during goal movement upgrade', "createdAt"
FROM "Goal"
WHERE "currentAmount" > 0;

CREATE INDEX "GoalMovement_goalId_movementDate_idx" ON "GoalMovement"("goalId", "movementDate" DESC);
CREATE INDEX "GoalMovement_accountId_movementDate_idx" ON "GoalMovement"("accountId", "movementDate" DESC);

ALTER TABLE "GoalMovement" ADD CONSTRAINT "GoalMovement_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoalMovement" ADD CONSTRAINT "GoalMovement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

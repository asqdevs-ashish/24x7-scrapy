-- Job control: pause/resume, target lead count, priority queue, fresh re-runs.

-- AlterEnum
ALTER TYPE "public"."JobStatus" ADD VALUE 'paused';

-- DropIndex
DROP INDEX "public"."scraping_jobs_status_created_at_idx";

-- AlterTable
ALTER TABLE "public"."scraping_jobs" ADD COLUMN     "is_priority" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "refresh_existing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "target_leads" INTEGER;

-- CreateIndex (priority queue: WHERE status = 'pending' ORDER BY is_priority DESC, created_at)
CREATE INDEX "scraping_jobs_status_is_priority_created_at_idx" ON "public"."scraping_jobs"("status", "is_priority", "created_at");

-- Deleting a scraping job now deletes its leads (was ON DELETE SET NULL).

-- DropForeignKey
ALTER TABLE "public"."realtor_leads" DROP CONSTRAINT "realtor_leads_job_id_fkey";

-- AddForeignKey
ALTER TABLE "public"."realtor_leads" ADD CONSTRAINT "realtor_leads_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."scraping_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "public"."JobStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "public"."scraping_jobs" (
    "id" SERIAL NOT NULL,
    "location" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "public"."JobStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "cards_seen" INTEGER NOT NULL DEFAULT 0,
    "leads_saved" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "scraping_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."realtor_leads" (
    "id" SERIAL NOT NULL,
    "business_name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "google_category" TEXT,
    "phone" TEXT,
    "rating" DOUBLE PRECISION,
    "reviews_count" INTEGER NOT NULL DEFAULT 0,
    "has_website" BOOLEAN NOT NULL DEFAULT false,
    "website_url" TEXT,
    "social_url" TEXT,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "place_key" TEXT NOT NULL,
    "maps_url" TEXT,
    "search_location" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "job_id" INTEGER,

    CONSTRAINT "realtor_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scraping_jobs_status_created_at_idx" ON "public"."scraping_jobs"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "realtor_leads_phone_key" ON "public"."realtor_leads"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "realtor_leads_place_key_key" ON "public"."realtor_leads"("place_key");

-- CreateIndex
CREATE INDEX "realtor_leads_rating_idx" ON "public"."realtor_leads"("rating");

-- CreateIndex
CREATE INDEX "realtor_leads_reviews_count_idx" ON "public"."realtor_leads"("reviews_count");

-- CreateIndex
CREATE INDEX "realtor_leads_has_website_idx" ON "public"."realtor_leads"("has_website");

-- CreateIndex
CREATE INDEX "realtor_leads_category_idx" ON "public"."realtor_leads"("category");

-- CreateIndex
CREATE INDEX "realtor_leads_created_at_idx" ON "public"."realtor_leads"("created_at");

-- CreateIndex
CREATE INDEX "realtor_leads_job_id_idx" ON "public"."realtor_leads"("job_id");

-- AddForeignKey
ALTER TABLE "public"."realtor_leads" ADD CONSTRAINT "realtor_leads_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."scraping_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

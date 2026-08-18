-- CreateTable
CREATE TABLE IF NOT EXISTS "committee_invite_tokens" (
    "id" STRING NOT NULL,
    "token_hash" STRING NOT NULL,
    "user_id" STRING NOT NULL,
    "event_id" STRING NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" STRING,

    CONSTRAINT "committee_invite_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "committee_invite_tokens_token_hash_key" ON "committee_invite_tokens"("token_hash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "committee_invite_tokens_user_id_event_id_idx" ON "committee_invite_tokens"("user_id", "event_id");

-- AddForeignKey
ALTER TABLE "committee_invite_tokens" ADD CONSTRAINT "committee_invite_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_invite_tokens" ADD CONSTRAINT "committee_invite_tokens_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

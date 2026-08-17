-- ─── EFT payment verification ─────────────────────────────────────────────────
-- Namibian customers pay by instant bank transfer. There is no bank API to
-- detect incoming payments, so an AI agent reads the customer's proof-of-payment
-- document and decides whether to activate the account.
--
-- Design: activate provisionally on AI verification, confirm on manual bank
-- reconciliation, revoke if the money never lands. Access is revocable and the
-- amounts are small, so optimistic activation is the right trade.

-- Human-readable, sequential reference. This is the join key across the invoice,
-- the customer's transfer, the proof document, the bank statement and the
-- activation record — it is what makes one payment traceable end to end.
CREATE SEQUENCE IF NOT EXISTS payment_reference_seq START 1;

CREATE TABLE IF NOT EXISTS payment_claims (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference        TEXT UNIQUE NOT NULL,                 -- MM-0042
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan             TEXT NOT NULL CHECK (plan IN ('pro', 'business')),
    expected_amount  NUMERIC(10,2) NOT NULL,
    currency         TEXT NOT NULL DEFAULT 'NAD',
    status           TEXT NOT NULL DEFAULT 'awaiting_proof'
        CHECK (status IN ('awaiting_proof','ai_verified','needs_review',
                          'reconciled','rejected','expired')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at       TIMESTAMPTZ NOT NULL,
    activated_at     TIMESTAMPTZ,
    reconciled_at    TIMESTAMPTZ,
    reconciled_by    TEXT
);

CREATE INDEX IF NOT EXISTS payment_claims_status_idx  ON payment_claims (status, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_claims_user_idx    ON payment_claims (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_proofs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id     UUID NOT NULL REFERENCES payment_claims(id) ON DELETE CASCADE,
    source       TEXT NOT NULL DEFAULT 'upload',           -- upload | email
    file_hash    TEXT NOT NULL,                            -- sha256, blocks resubmission
    mime_type    TEXT,
    extracted    JSONB,                                    -- the AI's structured read
    confidence   NUMERIC(3,2),
    decision     TEXT,                                     -- activate | review | reject
    reasoning    TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The same document can never be submitted twice, by anyone.
CREATE UNIQUE INDEX IF NOT EXISTS payment_proofs_hash_idx ON payment_proofs (file_hash);
CREATE INDEX IF NOT EXISTS payment_proofs_claim_idx ON payment_proofs (claim_id, created_at DESC);

-- Extend the existing agent_decisions log rather than adding a second one, so
-- every agent's evidence (classifier, chat, payment verification) lives together.
ALTER TABLE agent_decisions
    ADD COLUMN IF NOT EXISTS confidence  NUMERIC(3,2),
    ADD COLUMN IF NOT EXISTS entity_type TEXT,
    ADD COLUMN IF NOT EXISTS entity_id   UUID;

CREATE INDEX IF NOT EXISTS agent_decisions_agent_idx ON agent_decisions (agent, created_at DESC);

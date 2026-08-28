import fs from 'fs-extra'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import rootPath from '../rootPath.js'

export const INTERACTION_DATABASE_VERSION = 2

const CIPHERTEXT_PREFIX = 'aes-256-gcm$1$'
const CIPHERTEXT_IV_LENGTH = 16
const CIPHERTEXT_TAG_LENGTH = 22

function ciphertextSqlCheck (column, options = {}) {
  const prefixLength = CIPHERTEXT_PREFIX.length
  const ivStart = prefixLength + 1
  const ivSeparator = ivStart + CIPHERTEXT_IV_LENGTH
  const tagStart = ivSeparator + 1
  const tagSeparator = tagStart + CIPHERTEXT_TAG_LENGTH
  const ciphertextStart = tagSeparator + 1
  const formatCheck = `(
    typeof(${column}) = 'text'
    AND instr(${column}, char(0)) = 0
    AND substr(${column}, 1, ${prefixLength}) = '${CIPHERTEXT_PREFIX}'
    AND substr(${column}, ${ivStart}, ${CIPHERTEXT_IV_LENGTH}) NOT GLOB '*[^A-Za-z0-9_-]*'
    AND substr(${column}, ${ivSeparator}, 1) = '$'
    AND substr(${column}, ${tagStart}, ${CIPHERTEXT_TAG_LENGTH}) NOT GLOB '*[^A-Za-z0-9_-]*'
    AND substr(${column}, ${tagSeparator}, 1) = '$'
    AND length(substr(${column}, ${ciphertextStart})) >= 2
    AND length(substr(${column}, ${ciphertextStart})) % 4 <> 1
    AND substr(${column}, ${ciphertextStart}) NOT GLOB '*[^A-Za-z0-9_-]*'
  )`
  return options.allowEmpty === true ? `(${column} = '' OR ${formatCheck})` : formatCheck
}

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS interaction_policy_versions (
  version INTEGER PRIMARY KEY,
  policy_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  superseded_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_interaction_policy_active
  ON interaction_policy_versions(active) WHERE active = 1;

CREATE TABLE IF NOT EXISTS ai_provider_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  secret_ref TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  timeout_ms INTEGER NOT NULL DEFAULT 3000,
  max_attempts INTEGER NOT NULL DEFAULT 2,
  daily_budget INTEGER NOT NULL DEFAULT 0,
  max_concurrency INTEGER NOT NULL DEFAULT 2,
  prompt_version TEXT NOT NULL DEFAULT 'interaction-moderation-v1',
  redaction_json TEXT NOT NULL DEFAULT '{}',
  adapter_id TEXT NOT NULL DEFAULT '',
  health_status TEXT NOT NULL DEFAULT 'unknown',
  last_verified_at TEXT,
  daily_budget_day TEXT NOT NULL DEFAULT '',
  daily_budget_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_provider_default
  ON ai_provider_configs(is_default) WHERE is_default = 1;

CREATE TABLE IF NOT EXISTS ai_prompt_versions (
  version TEXT PRIMARY KEY,
  prompt_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_prompt_active
  ON ai_prompt_versions(active) WHERE active = 1;

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY CHECK (substr(id, 1, 4) = 'cmt_'),
  site_id TEXT NOT NULL CHECK (site_id = 'map-service'),
  canonical_share_id TEXT NOT NULL,
  share_public_id_snapshot TEXT NOT NULL,
  share_item_id TEXT NOT NULL,
  feature_id TEXT NOT NULL,
  media_id TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL CHECK (scope IN ('feature')),
  content_revision INTEGER NOT NULL DEFAULT 1 CHECK (content_revision > 0),
  resource_snapshot_json TEXT NOT NULL DEFAULT '{}',
  parent_id TEXT,
  thread_depth INTEGER NOT NULL DEFAULT 0 CHECK (thread_depth IN (0, 1)),
  author_type TEXT NOT NULL DEFAULT 'anonymous' CHECK (author_type IN ('user', 'anonymous', 'admin')),
  author_user_id TEXT NOT NULL DEFAULT '',
  author_key TEXT NOT NULL,
  display_name_snapshot TEXT NOT NULL DEFAULT '',
  body_raw_encrypted TEXT NOT NULL,
  body_normalized TEXT NOT NULL,
  body_rendered TEXT NOT NULL DEFAULT '',
  consent_policy_version INTEGER NOT NULL CHECK (consent_policy_version > 0),
  contact_ciphertext TEXT NOT NULL DEFAULT '',
  contact_hash TEXT NOT NULL DEFAULT '',
  contact_type TEXT NOT NULL DEFAULT '' CHECK (contact_type IN ('', 'email', 'phone', 'email_and_phone')),
  contact_expires_at TEXT,
  content_status TEXT NOT NULL DEFAULT 'active' CHECK (content_status IN ('active', 'hidden', 'deleted')),
  moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'quarantined', 'spam', 'orphaned')),
  moderation_level TEXT NOT NULL DEFAULT 'unknown' CHECK (moderation_level IN ('normal', 'risk', 'violation', 'illegal_or_ip', 'spam', 'unknown')),
  visible_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  approved_at TEXT,
  deleted_at TEXT,
  orphaned_at TEXT,
  legal_hold INTEGER NOT NULL DEFAULT 0 CHECK (legal_hold IN (0, 1)),
  legal_hold_reason TEXT NOT NULL DEFAULT '',
  legal_hold_at TEXT,
  retention_expires_at TEXT,
  client_request_id TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE RESTRICT,
  FOREIGN KEY (consent_policy_version) REFERENCES interaction_policy_versions(version) ON DELETE RESTRICT,
  CHECK (scope = 'feature' AND media_id = ''),
  CHECK ((thread_depth = 0 AND parent_id IS NULL) OR
         (thread_depth = 1 AND parent_id IS NOT NULL)),
  CHECK ((author_type = 'anonymous' AND author_user_id = '') OR
         (author_type IN ('user', 'admin') AND author_user_id <> '')),
  CHECK ((contact_type = '' AND contact_ciphertext = '' AND contact_hash = '') OR
         (contact_type <> '' AND contact_ciphertext <> '' AND contact_hash <> '')),
  CHECK (${ciphertextSqlCheck('body_raw_encrypted')}),
  CHECK (${ciphertextSqlCheck('contact_ciphertext', { allowEmpty: true })}),
  CHECK (content_status <> 'deleted' OR deleted_at IS NOT NULL),
  CHECK (moderation_status <> 'approved' OR approved_at IS NOT NULL),
  CHECK (moderation_status <> 'orphaned' OR orphaned_at IS NOT NULL),
  CHECK (legal_hold = 0 OR (legal_hold_reason <> '' AND legal_hold_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_comments_resource_status
  ON comments(canonical_share_id, share_item_id, feature_id, content_status, moderation_status, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_public_order
  ON comments(canonical_share_id, share_item_id, feature_id, approved_at, id)
  WHERE content_status = 'active' AND moderation_status = 'approved';
CREATE INDEX IF NOT EXISTS idx_comments_retention
  ON comments(retention_expires_at, legal_hold, content_status, moderation_status);
CREATE INDEX IF NOT EXISTS idx_comments_contact
  ON comments(contact_hash, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_comments_idempotency
  ON comments(canonical_share_id, share_item_id, feature_id, author_type, author_key, client_request_id)
  WHERE client_request_id <> '';

CREATE TRIGGER IF NOT EXISTS trg_comments_parent_insert
BEFORE INSERT ON comments
WHEN NEW.parent_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'COMMENT_PARENT_INVALID')
  WHERE NOT EXISTS (
    SELECT 1 FROM comments AS parent
    WHERE parent.id = NEW.parent_id
      AND parent.id <> NEW.id
      AND parent.canonical_share_id = NEW.canonical_share_id
      AND parent.share_item_id = NEW.share_item_id
      AND parent.feature_id = NEW.feature_id
      AND parent.scope = NEW.scope
      AND parent.thread_depth = 0
      AND parent.content_status = 'active'
      AND parent.moderation_status = 'approved'
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_comments_parent_update
BEFORE UPDATE OF parent_id, thread_depth, canonical_share_id, share_item_id,
  feature_id, scope ON comments
WHEN NEW.parent_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'COMMENT_PARENT_INVALID')
  WHERE NOT EXISTS (
    SELECT 1 FROM comments AS parent
    WHERE parent.id = NEW.parent_id
      AND parent.id <> NEW.id
      AND parent.canonical_share_id = NEW.canonical_share_id
      AND parent.share_item_id = NEW.share_item_id
      AND parent.feature_id = NEW.feature_id
      AND parent.scope = NEW.scope
      AND parent.thread_depth = 0
      AND parent.content_status = 'active'
      AND parent.moderation_status = 'approved'
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_comments_parent_identity_guard
BEFORE UPDATE OF parent_id, thread_depth, canonical_share_id, share_item_id,
  feature_id, scope ON comments
WHEN EXISTS (SELECT 1 FROM comments AS child WHERE child.parent_id = OLD.id)
  AND (
    NEW.parent_id IS NOT OLD.parent_id
    OR NEW.thread_depth IS NOT OLD.thread_depth
    OR NEW.canonical_share_id IS NOT OLD.canonical_share_id
    OR NEW.share_item_id IS NOT OLD.share_item_id
    OR NEW.feature_id IS NOT OLD.feature_id
    OR NEW.scope IS NOT OLD.scope
  )
BEGIN
  SELECT RAISE(ABORT, 'COMMENT_PARENT_HAS_REPLIES');
END;

CREATE TRIGGER IF NOT EXISTS trg_comments_reply_visibility_update
BEFORE UPDATE OF content_status, moderation_status ON comments
WHEN NEW.parent_id IS NOT NULL
  AND NEW.content_status = 'active'
  AND NEW.moderation_status = 'approved'
BEGIN
  SELECT RAISE(ABORT, 'COMMENT_PARENT_INVALID')
  WHERE NOT EXISTS (
    SELECT 1 FROM comments AS parent
    WHERE parent.id = NEW.parent_id
      AND parent.canonical_share_id = NEW.canonical_share_id
      AND parent.share_item_id = NEW.share_item_id
      AND parent.feature_id = NEW.feature_id
      AND parent.scope = NEW.scope
      AND parent.thread_depth = 0
      AND parent.content_status = 'active'
      AND parent.moderation_status = 'approved'
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_comments_parent_visibility_cascade
AFTER UPDATE OF content_status, moderation_status ON comments
WHEN NEW.thread_depth = 0
  AND (NEW.content_status <> 'active' OR NEW.moderation_status <> 'approved')
BEGIN
  UPDATE comments
  SET content_status = CASE WHEN content_status = 'active' THEN 'hidden' ELSE content_status END,
      moderation_status = CASE
        WHEN NEW.moderation_status = 'orphaned' THEN 'orphaned'
        ELSE moderation_status
      END,
      orphaned_at = CASE
        WHEN NEW.moderation_status = 'orphaned' THEN COALESCE(orphaned_at, NEW.orphaned_at, NEW.updated_at)
        ELSE orphaned_at
      END,
      updated_at = NEW.updated_at
  WHERE parent_id = NEW.id
    AND (
      content_status = 'active'
      OR (NEW.moderation_status = 'orphaned' AND moderation_status <> 'orphaned')
    );
END;

CREATE TABLE IF NOT EXISTS comment_moderation_decisions (
  id TEXT PRIMARY KEY CHECK (substr(id, 1, 4) = 'cmd_'),
  comment_id TEXT NOT NULL,
  content_revision INTEGER NOT NULL CHECK (content_revision > 0),
  stage TEXT NOT NULL CHECK (stage IN ('keyword', 'ai', 'human')),
  level TEXT NOT NULL CHECK (level IN ('normal', 'risk', 'violation', 'illegal_or_ip', 'spam', 'unknown')),
  scores_json TEXT NOT NULL DEFAULT '{}',
  reason_codes_json TEXT NOT NULL DEFAULT '[]',
  suggested_action TEXT NOT NULL CHECK (suggested_action IN ('approve', 'review', 'reject', 'quarantine', 'spam')),
  provider_id TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  prompt_version TEXT NOT NULL DEFAULT '',
  keyword_policy_version INTEGER,
  raw_result_ciphertext TEXT NOT NULL DEFAULT '',
  raw_result_expires_at TEXT,
  result_hash TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  CHECK (raw_result_ciphertext = '' OR raw_result_expires_at IS NOT NULL),
  CHECK (${ciphertextSqlCheck('raw_result_ciphertext', { allowEmpty: true })})
);
CREATE INDEX IF NOT EXISTS idx_comment_decisions_comment
  ON comment_moderation_decisions(comment_id, content_revision, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_decisions_idempotency
  ON comment_moderation_decisions(comment_id, content_revision, stage, idempotency_key)
  WHERE idempotency_key <> '';

CREATE TABLE IF NOT EXISTS comment_outbox (
  id TEXT PRIMARY KEY CHECK (substr(id, 1, 4) = 'evt_'),
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL CHECK (aggregate_type IN ('comment')),
  aggregate_id TEXT NOT NULL,
  comment_id TEXT NOT NULL DEFAULT '',
  dedupe_key TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TEXT NOT NULL,
  locked_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT,
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  CHECK (comment_id <> ''),
  CHECK (aggregate_id = comment_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_outbox_dedupe ON comment_outbox(dedupe_key);
CREATE INDEX IF NOT EXISTS idx_comment_outbox_ready ON comment_outbox(status, available_at, created_at);

CREATE TABLE IF NOT EXISTS moderation_keyword_versions (
  version INTEGER PRIMARY KEY,
  source_policy_version INTEGER NOT NULL,
  rules_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  created_by TEXT NOT NULL DEFAULT '',
  change_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  superseded_at TEXT,
  FOREIGN KEY (source_policy_version) REFERENCES interaction_policy_versions(version) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_keyword_versions_active
  ON moderation_keyword_versions(active) WHERE active = 1;

CREATE TABLE IF NOT EXISTS moderation_keyword_rules (
  id TEXT PRIMARY KEY,
  policy_version INTEGER NOT NULL,
  normalized_term TEXT NOT NULL,
  match_type TEXT NOT NULL CHECK (match_type IN ('exact', 'phrase', 'pattern')),
  category TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL CHECK (level IN ('risk', 'violation', 'illegal_or_ip', 'spam')),
  action TEXT NOT NULL CHECK (action IN ('reject', 'quarantine', 'flag', 'replace')),
  replacement TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  starts_at TEXT,
  ends_at TEXT,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (policy_version) REFERENCES moderation_keyword_versions(version) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_keyword_rules_active
  ON moderation_keyword_rules(policy_version, enabled, normalized_term);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY CHECK (substr(id, 1, 4) = 'rpt_'),
  site_id TEXT NOT NULL CHECK (site_id = 'map-service'),
  report_type TEXT NOT NULL CHECK (report_type IN ('unsafe_content', 'illegal_content', 'copyright_takedown', 'privacy', 'misleading', 'other')),
  canonical_share_id TEXT NOT NULL,
  share_public_id_snapshot TEXT NOT NULL,
  share_item_id TEXT NOT NULL DEFAULT '',
  feature_id TEXT NOT NULL DEFAULT '',
  media_id TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL CHECK (scope IN ('share', 'feature', 'media')),
  resource_snapshot_json TEXT NOT NULL DEFAULT '{}',
  reporter_type TEXT NOT NULL CHECK (reporter_type IN ('user', 'anonymous')),
  reporter_user_id TEXT NOT NULL DEFAULT '',
  reporter_key TEXT NOT NULL,
  display_name_snapshot TEXT NOT NULL DEFAULT '',
  contact_ciphertext TEXT NOT NULL DEFAULT '',
  contact_hash TEXT NOT NULL DEFAULT '',
  description_ciphertext TEXT NOT NULL,
  evidence_text_ciphertext TEXT NOT NULL DEFAULT '',
  rights_attestation INTEGER NOT NULL DEFAULT 0 CHECK (rights_attestation IN (0, 1)),
  consent_policy_version INTEGER NOT NULL CHECK (consent_policy_version > 0),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'triaged', 'investigating', 'actioned', 'dismissed', 'duplicate', 'closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to TEXT NOT NULL DEFAULT '',
  duplicate_of TEXT,
  action_summary_json TEXT NOT NULL DEFAULT '{}',
  legal_hold INTEGER NOT NULL DEFAULT 0 CHECK (legal_hold IN (0, 1)),
  legal_hold_reason TEXT NOT NULL DEFAULT '',
  legal_hold_at TEXT,
  retention_expires_at TEXT,
  client_request_id TEXT NOT NULL DEFAULT '',
  dedupe_key TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (duplicate_of) REFERENCES reports(id) ON DELETE SET NULL,
  FOREIGN KEY (consent_policy_version) REFERENCES interaction_policy_versions(version) ON DELETE RESTRICT,
  CHECK ((scope = 'share' AND share_item_id = '' AND feature_id = '' AND media_id = '') OR
         (scope = 'feature' AND share_item_id <> '' AND feature_id <> '' AND media_id = '') OR
         (scope = 'media' AND share_item_id <> '' AND feature_id <> '' AND media_id <> '')),
  CHECK ((reporter_type = 'anonymous' AND reporter_user_id = '') OR
         (reporter_type = 'user' AND reporter_user_id <> '')),
  CHECK (legal_hold = 0 OR (legal_hold_reason <> '' AND legal_hold_at IS NOT NULL)),
  CHECK (report_type <> 'copyright_takedown' OR
         (rights_attestation = 1 AND display_name_snapshot <> '' AND contact_ciphertext <> '' AND contact_hash <> '')),
  CHECK ((contact_ciphertext = '' AND contact_hash = '') OR
         (contact_ciphertext <> '' AND contact_hash <> '')),
  CHECK (${ciphertextSqlCheck('description_ciphertext')}),
  CHECK (${ciphertextSqlCheck('evidence_text_ciphertext', { allowEmpty: true })}),
  CHECK (${ciphertextSqlCheck('contact_ciphertext', { allowEmpty: true })})
);
CREATE INDEX IF NOT EXISTS idx_reports_queue ON reports(status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_resource ON reports(canonical_share_id, scope, share_item_id, feature_id, media_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_retention ON reports(retention_expires_at, legal_hold, status);
CREATE INDEX IF NOT EXISTS idx_reports_contact ON reports(contact_hash, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_idempotency
  ON reports(canonical_share_id, reporter_type, reporter_key, client_request_id)
  WHERE client_request_id <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_dedupe
  ON reports(dedupe_key)
  WHERE dedupe_key <> '';

CREATE TABLE IF NOT EXISTS report_events (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_status TEXT NOT NULL DEFAULT '',
  to_status TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_report_events_report ON report_events(report_id, created_at);
CREATE INDEX IF NOT EXISTS idx_report_events_created ON report_events(created_at DESC);
`

// AI credentials, editable prompts and author profile snapshots were added
// after the first interaction v1 rollout. Keep their schema additive so a
// legacy v1 file can be upgraded transactionally to v2.
const AI_PROVIDER_SCHEMA = `
CREATE TABLE IF NOT EXISTS ai_provider_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  endpoint TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  secret_ref TEXT NOT NULL DEFAULT '',
  api_key_ciphertext TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  timeout_ms INTEGER NOT NULL DEFAULT 3000,
  max_attempts INTEGER NOT NULL DEFAULT 2,
  daily_budget INTEGER NOT NULL DEFAULT 0,
  max_concurrency INTEGER NOT NULL DEFAULT 2,
  prompt_version TEXT NOT NULL DEFAULT 'interaction-moderation-v1',
  redaction_json TEXT NOT NULL DEFAULT '{}',
  adapter_id TEXT NOT NULL DEFAULT '',
  health_status TEXT NOT NULL DEFAULT 'unknown',
  last_verified_at TEXT,
  daily_budget_day TEXT NOT NULL DEFAULT '',
  daily_budget_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_provider_default
  ON ai_provider_configs(is_default) WHERE is_default = 1;

CREATE TABLE IF NOT EXISTS ai_prompt_versions (
  version TEXT PRIMARY KEY,
  prompt_hash TEXT NOT NULL DEFAULT '',
  prompt_text TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_prompt_active
  ON ai_prompt_versions(active) WHERE active = 1;
`

const AI_DECISION_SCHEMA = `
CREATE TABLE IF NOT EXISTS comment_moderation_decisions (
  id TEXT PRIMARY KEY CHECK (substr(id, 1, 4) = 'cmd_'),
  comment_id TEXT NOT NULL,
  content_revision INTEGER NOT NULL DEFAULT 1 CHECK (content_revision > 0),
  stage TEXT NOT NULL DEFAULT 'ai' CHECK (stage IN ('keyword', 'ai', 'human')),
  level TEXT NOT NULL DEFAULT 'unknown' CHECK (level IN ('normal', 'risk', 'violation', 'illegal_or_ip', 'spam', 'unknown')),
  scores_json TEXT NOT NULL DEFAULT '{}',
  reason_codes_json TEXT NOT NULL DEFAULT '[]',
  suggested_action TEXT NOT NULL DEFAULT 'review' CHECK (suggested_action IN ('approve', 'review', 'reject', 'quarantine', 'spam')),
  provider_id TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  prompt_version TEXT NOT NULL DEFAULT '',
  keyword_policy_version INTEGER,
  raw_result_ciphertext TEXT NOT NULL DEFAULT '',
  raw_result_expires_at TEXT,
  result_hash TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  CHECK (raw_result_ciphertext = '' OR raw_result_expires_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_comment_decisions_comment
  ON comment_moderation_decisions(comment_id, content_revision, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_decisions_idempotency
  ON comment_moderation_decisions(comment_id, content_revision, stage, idempotency_key)
  WHERE idempotency_key <> '';
`

const AI_REVIEW_SCHEMA = `
CREATE TABLE IF NOT EXISTS ai_review_claims (
  idempotency_key TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL,
  content_revision INTEGER NOT NULL CHECK (content_revision > 0),
  policy_revision TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  decision_id TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts > 0),
  last_error TEXT NOT NULL DEFAULT '',
  claimed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ai_review_claims_comment
  ON ai_review_claims(comment_id, content_revision, updated_at);

CREATE TABLE IF NOT EXISTS ai_budget_usage (
  day TEXT PRIMARY KEY,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artalk_comment_projections (
  comment_id TEXT PRIMARY KEY,
  provider_comment_id INTEGER,
  page_key TEXT NOT NULL DEFAULT '',
  state_hash TEXT NOT NULL DEFAULT '',
  projection_status TEXT NOT NULL DEFAULT 'unknown' CHECK (projection_status IN ('unknown', 'visible', 'removed', 'failed')),
  last_error TEXT NOT NULL DEFAULT '',
  synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_artalk_projection_provider_comment
  ON artalk_comment_projections(provider_comment_id) WHERE provider_comment_id IS NOT NULL;
`

const AI_PROVIDER_COLUMNS = Object.freeze([
  ['name', "TEXT NOT NULL DEFAULT ''"],
  ['endpoint', "TEXT NOT NULL DEFAULT ''"],
  ['model', "TEXT NOT NULL DEFAULT ''"],
  ['secret_ref', "TEXT NOT NULL DEFAULT ''"],
  ['api_key_ciphertext', "TEXT NOT NULL DEFAULT ''"],
  ['enabled', 'INTEGER NOT NULL DEFAULT 1'],
  ['is_default', 'INTEGER NOT NULL DEFAULT 0'],
  ['timeout_ms', 'INTEGER NOT NULL DEFAULT 3000'],
  ['max_attempts', 'INTEGER NOT NULL DEFAULT 2'],
  ['daily_budget', 'INTEGER NOT NULL DEFAULT 0'],
  ['max_concurrency', 'INTEGER NOT NULL DEFAULT 2'],
  ['prompt_version', "TEXT NOT NULL DEFAULT 'interaction-moderation-v1'"],
  ['redaction_json', "TEXT NOT NULL DEFAULT '{}'"],
  ['adapter_id', "TEXT NOT NULL DEFAULT ''"],
  ['health_status', "TEXT NOT NULL DEFAULT 'unknown'"],
  ['last_verified_at', 'TEXT'],
  ['daily_budget_day', "TEXT NOT NULL DEFAULT ''"],
  ['daily_budget_used', 'INTEGER NOT NULL DEFAULT 0'],
  ['created_at', "TEXT NOT NULL DEFAULT ''"],
  ['updated_at', "TEXT NOT NULL DEFAULT ''"],
])

const AI_PROMPT_COLUMNS = Object.freeze([
  ['prompt_hash', "TEXT NOT NULL DEFAULT ''"],
  ['prompt_text', "TEXT NOT NULL DEFAULT ''"],
  ['active', 'INTEGER NOT NULL DEFAULT 0'],
  ['created_by', "TEXT NOT NULL DEFAULT ''"],
  ['created_at', "TEXT NOT NULL DEFAULT ''"],
])

const AI_DECISION_COLUMNS = Object.freeze([
  ['comment_id', "TEXT NOT NULL DEFAULT ''"],
  ['content_revision', 'INTEGER NOT NULL DEFAULT 1'],
  ['stage', "TEXT NOT NULL DEFAULT 'ai'"],
  ['level', "TEXT NOT NULL DEFAULT 'unknown'"],
  ['scores_json', "TEXT NOT NULL DEFAULT '{}'"],
  ['reason_codes_json', "TEXT NOT NULL DEFAULT '[]'"],
  ['suggested_action', "TEXT NOT NULL DEFAULT 'review'"],
  ['provider_id', "TEXT NOT NULL DEFAULT ''"],
  ['model', "TEXT NOT NULL DEFAULT ''"],
  ['prompt_version', "TEXT NOT NULL DEFAULT ''"],
  ['keyword_policy_version', 'INTEGER'],
  ['raw_result_ciphertext', "TEXT NOT NULL DEFAULT ''"],
  ['raw_result_expires_at', 'TEXT'],
  ['result_hash', "TEXT NOT NULL DEFAULT ''"],
  ['actor_user_id', "TEXT NOT NULL DEFAULT ''"],
  ['created_at', "TEXT NOT NULL DEFAULT ''"],
  ['idempotency_key', "TEXT NOT NULL DEFAULT ''"],
])

const COMMENT_COLUMNS = Object.freeze([
  ['contact_expires_at', 'TEXT'],
  ['avatar_snapshot', "TEXT NOT NULL DEFAULT ''"],
  ['gender_snapshot', "TEXT NOT NULL DEFAULT ''"],
])

function tableColumns (database, tableName) {
  return new Set(database.prepare(`PRAGMA table_info(${tableName})`).all().map(column => column.name))
}

function addMissingColumns (database, tableName, columns) {
  const existing = tableColumns(database, tableName)
  for (const [name, definition] of columns) {
    if (existing.has(name)) continue
    database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${name} ${definition}`)
    existing.add(name)
  }
}

/** Ensure the additive AI schema exists for both fresh and legacy v1 files. */
export function ensureAiSchema (database) {
  database.exec(AI_PROVIDER_SCHEMA)
  addMissingColumns(database, 'ai_provider_configs', AI_PROVIDER_COLUMNS)
  addMissingColumns(database, 'ai_prompt_versions', AI_PROMPT_COLUMNS)

  const decisionTableExists = database.prepare(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'comment_moderation_decisions'"
  ).get()
  if (!decisionTableExists) database.exec(AI_DECISION_SCHEMA)
  else addMissingColumns(database, 'comment_moderation_decisions', AI_DECISION_COLUMNS)
  database.exec(AI_REVIEW_SCHEMA)
  addMissingColumns(database, 'comments', COMMENT_COLUMNS)

  // Older development snapshots called this field raw_result_encrypted.  Move
  // only values that already have the interaction ciphertext prefix, then wipe
  // the legacy column so a stale plaintext value cannot survive the upgrade.
  const decisionColumns = tableColumns(database, 'comment_moderation_decisions')
  if (decisionColumns.has('raw_result_encrypted')) {
    if (decisionColumns.has('raw_result_ciphertext')) {
      database.prepare(`
        UPDATE comment_moderation_decisions
        SET raw_result_ciphertext = raw_result_encrypted,
            raw_result_expires_at = COALESCE(raw_result_expires_at, datetime('now', '+30 days'))
        WHERE raw_result_ciphertext = ''
          AND typeof(raw_result_encrypted) = 'text'
          AND raw_result_encrypted LIKE 'aes-256-gcm$1$%'
      `).run()
    }
    database.exec("UPDATE comment_moderation_decisions SET raw_result_encrypted = ''")
  }
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_comment_decisions_comment
      ON comment_moderation_decisions(comment_id, content_revision, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_decisions_idempotency
      ON comment_moderation_decisions(comment_id, content_revision, stage, idempotency_key)
      WHERE idempotency_key <> '';
  `)
}

export class InteractionDatabase {
  constructor (options = {}) {
    this.filePath = options.filePath || path.resolve(rootPath, '.db/interaction.sqlite')
    if (this.filePath !== ':memory:') fs.ensureDirSync(path.dirname(this.filePath))
    this.ownsDatabase = !options.database
    this.database = options.database || new DatabaseSync(this.filePath)
    this.migrationHook = options.migrationHook
    this.transactionDepth = 0
    this.closed = false
    try {
      this.configure()
      this.migrate()
    } catch (error) {
      if (this.ownsDatabase) {
        try {
          this.close()
        } catch (closeError) {
          error.closeError = closeError
        }
      }
      throw error
    }
  }

  configure () {
    this.database.exec('PRAGMA foreign_keys = ON')
    this.database.exec('PRAGMA busy_timeout = 5000')
    if (this.filePath !== ':memory:') {
      try {
        this.database.exec('PRAGMA journal_mode = WAL')
      } catch (error) {
        if (!String(error?.message || '').includes('database is locked')) throw error
      }
      this.database.exec('PRAGMA synchronous = NORMAL')
    }
  }

  migrate () {
    this.transaction(() => {
      this.database.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        )
      `)
      const current = Number(this.database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.version || 0)
      if (current < 1) {
        this.database.exec(SCHEMA_V1)
        this.migrationHook?.(1, this.database)
        this.database.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)')
          .run(1, new Date().toISOString())
      }
      if (current < 2) {
        ensureAiSchema(this.database)
        this.migrationHook?.(2, this.database)
        this.database.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)')
          .run(2, new Date().toISOString())
      }
    })
    const finalVersion = Number(this.database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.version || 0)
    if (finalVersion !== INTERACTION_DATABASE_VERSION) {
      throw new Error(`不支持的交互数据库版本：${finalVersion}`)
    }
  }

  prepare (sql) { return this.database.prepare(sql) }
  exec (sql) { return this.database.exec(sql) }

  transaction (callback) {
    const depth = this.transactionDepth
    const savepoint = `interaction_tx_${depth}_${randomUUID().replaceAll('-', '')}`
    this.transactionDepth += 1
    try {
      if (depth === 0) this.database.exec('BEGIN IMMEDIATE')
      else this.database.exec(`SAVEPOINT ${savepoint}`)
      const result = callback()
      if (depth === 0) this.database.exec('COMMIT')
      else this.database.exec(`RELEASE SAVEPOINT ${savepoint}`)
      return result
    } catch (error) {
      try {
        if (depth === 0) this.database.exec('ROLLBACK')
        else {
          this.database.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`)
          this.database.exec(`RELEASE SAVEPOINT ${savepoint}`)
        }
      } catch (rollbackError) {
        error.rollbackError = rollbackError
      }
      throw error
    } finally {
      this.transactionDepth -= 1
    }
  }

  close () {
    if (this.closed) return
    this.database.close()
    this.closed = true
  }
}

export { SCHEMA_V1 }
export default InteractionDatabase

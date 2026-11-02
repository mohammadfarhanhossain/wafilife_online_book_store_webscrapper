CREATE TABLE IF NOT EXISTS sources (
  source_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(100) NOT NULL,
  base_url VARCHAR(500) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_sources_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS books (
  book_id BINARY(16) NOT NULL PRIMARY KEY,
  canonical_title VARCHAR(500) NOT NULL,
  normalized_title VARCHAR(500) NOT NULL,
  isbn13 CHAR(13) NULL,
  language_code VARCHAR(10) NOT NULL DEFAULT 'bn',
  description TEXT NULL,
  status ENUM('active', 'unavailable', 'merged', 'deleted') NOT NULL DEFAULT 'active',
  canonical_content_hash CHAR(64) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  UNIQUE KEY uq_books_isbn13 (isbn13),
  KEY ix_books_status_updated (status, updated_at),
  FULLTEXT KEY ft_books_title_description (canonical_title, description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS authors (
  author_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  canonical_name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_authors_normalized_name (normalized_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS publishers (
  publisher_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  canonical_name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_publishers_normalized_name (normalized_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subjects (
  subject_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  canonical_name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255) NOT NULL,
  parent_subject_id BIGINT UNSIGNED NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_subjects_normalized_name (normalized_name),
  KEY ix_subjects_parent (parent_subject_id),
  CONSTRAINT fk_subjects_parent FOREIGN KEY (parent_subject_id) REFERENCES subjects (subject_id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS book_authors (
  book_id BINARY(16) NOT NULL,
  author_id BIGINT UNSIGNED NOT NULL,
  role ENUM('author', 'editor', 'translator', 'contributor') NOT NULL DEFAULT 'author',
  display_order TINYINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (book_id, author_id, role),
  KEY ix_book_authors_author (author_id, book_id),
  CONSTRAINT fk_book_authors_book FOREIGN KEY (book_id) REFERENCES books (book_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_book_authors_author FOREIGN KEY (author_id) REFERENCES authors (author_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS book_publishers (
  book_id BINARY(16) NOT NULL,
  publisher_id BIGINT UNSIGNED NOT NULL,
  display_label VARCHAR(100) NULL,
  PRIMARY KEY (book_id, publisher_id),
  KEY ix_book_publishers_publisher (publisher_id, book_id),
  CONSTRAINT fk_book_publishers_book FOREIGN KEY (book_id) REFERENCES books (book_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_book_publishers_publisher FOREIGN KEY (publisher_id) REFERENCES publishers (publisher_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS book_subjects (
  book_id BINARY(16) NOT NULL,
  subject_id BIGINT UNSIGNED NOT NULL,
  confidence DECIMAL(5, 4) NULL,
  PRIMARY KEY (book_id, subject_id),
  KEY ix_book_subjects_subject (subject_id, book_id),
  CONSTRAINT fk_book_subjects_book FOREIGN KEY (book_id) REFERENCES books (book_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_book_subjects_subject FOREIGN KEY (subject_id) REFERENCES subjects (subject_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ingestion_batches (
  batch_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source_id SMALLINT UNSIGNED NOT NULL,
  input_type ENUM('csv', 'scraper', 'api') NOT NULL,
  file_name VARCHAR(500) NULL,
  file_hash CHAR(64) NULL,
  status ENUM('received', 'validated', 'imported', 'partial', 'failed') NOT NULL DEFAULT 'received',
  row_count INT UNSIGNED NOT NULL DEFAULT 0,
  error_count INT UNSIGNED NOT NULL DEFAULT 0,
  started_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  completed_at DATETIME(6) NULL,
  KEY ix_ingestion_batches_source_started (source_id, started_at),
  KEY ix_ingestion_batches_status_started (status, started_at),
  UNIQUE KEY uq_ingestion_batches_source_hash (source_id, file_hash),
  CONSTRAINT fk_ingestion_batches_source FOREIGN KEY (source_id) REFERENCES sources (source_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staging_book_rows (
  staging_row_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  batch_id BIGINT UNSIGNED NOT NULL,
  `row_number` INT UNSIGNED NOT NULL,
  source_book_key VARCHAR(500) NULL,
  source_url VARCHAR(1000) NULL,
  raw_row JSON NOT NULL,
  normalized_row JSON NULL,
  validation_status ENUM('pending', 'valid', 'invalid', 'review') NOT NULL DEFAULT 'pending',
  error_message TEXT NULL,
  matched_book_id BINARY(16) NULL,
  UNIQUE KEY uq_staging_batch_row (batch_id, `row_number`),
  KEY ix_staging_batch_status (batch_id, validation_status),
  KEY ix_staging_source_key (source_book_key),
  CONSTRAINT fk_staging_batch FOREIGN KEY (batch_id) REFERENCES ingestion_batches (batch_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_staging_matched_book FOREIGN KEY (matched_book_id) REFERENCES books (book_id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS source_books (
  source_book_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source_id SMALLINT UNSIGNED NOT NULL,
  source_book_key VARCHAR(500) NOT NULL,
  source_url VARCHAR(1000) NULL,
  book_id BINARY(16) NOT NULL,
  first_seen_at DATETIME(6) NOT NULL,
  last_seen_at DATETIME(6) NOT NULL,
  last_content_hash CHAR(64) NOT NULL,
  match_method ENUM('external_id', 'url', 'isbn', 'exact', 'manual') NOT NULL,
  match_confidence DECIMAL(5, 4) NOT NULL,
  status ENUM('active', 'missing', 'blocked', 'rejected') NOT NULL DEFAULT 'active',
  UNIQUE KEY uq_source_books_key (source_id, source_book_key),
  UNIQUE KEY uq_source_books_url (source_id, source_url(767)),
  KEY ix_source_books_book (book_id),
  KEY ix_source_books_source_status (source_id, status),
  CONSTRAINT fk_source_books_source FOREIGN KEY (source_id) REFERENCES sources (source_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_source_books_book FOREIGN KEY (book_id) REFERENCES books (book_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS source_book_state (
  source_book_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  source_title VARCHAR(500) NOT NULL,
  source_isbn13 CHAR(13) NULL,
  source_author_text VARCHAR(500) NULL,
  source_publisher_text VARCHAR(500) NULL,
  source_subject_text VARCHAR(500) NULL,
  list_price DECIMAL(12, 2) NULL,
  sale_price DECIMAL(12, 2) NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'BDT',
  availability ENUM('in_stock', 'out_of_stock', 'unknown', 'discontinued') NOT NULL DEFAULT 'unknown',
  anomaly_flags JSON NULL,
  raw_payload JSON NULL,
  observed_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY ix_source_book_state_availability (availability, updated_at),
  KEY ix_source_book_state_sale_price (sale_price),
  CONSTRAINT fk_source_book_state_source_book FOREIGN KEY (source_book_id) REFERENCES source_books (source_book_id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS price_history (
  price_history_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source_book_id BIGINT UNSIGNED NOT NULL,
  list_price DECIMAL(12, 2) NULL,
  sale_price DECIMAL(12, 2) NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'BDT',
  anomaly_flags JSON NULL,
  observed_at DATETIME(6) NOT NULL,
  batch_id BIGINT UNSIGNED NOT NULL,
  KEY ix_price_history_source_observed (source_book_id, observed_at),
  KEY ix_price_history_observed (observed_at),
  CONSTRAINT fk_price_history_source_book FOREIGN KEY (source_book_id) REFERENCES source_books (source_book_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_price_history_batch FOREIGN KEY (batch_id) REFERENCES ingestion_batches (batch_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS legacy_book_ids (
  legacy_system VARCHAR(50) NOT NULL,
  legacy_book_id VARCHAR(100) NOT NULL,
  book_id BINARY(16) NOT NULL,
  confidence DECIMAL(5, 4) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (legacy_system, legacy_book_id),
  KEY ix_legacy_book_ids_book (book_id),
  CONSTRAINT fk_legacy_book_ids_book FOREIGN KEY (book_id) REFERENCES books (book_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  user_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(320) NULL,
  anonymous_key CHAR(64) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_anonymous_key (anonymous_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_interactions (
  event_id BINARY(16) NOT NULL PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  anonymous_key CHAR(64) NULL,
  book_id BINARY(16) NULL,
  event_type ENUM('search', 'view', 'click', 'wishlist_add', 'wishlist_remove', 'cart_add', 'purchase', 'dismiss', 'recommendation_click') NOT NULL,
  session_id VARCHAR(128) NULL,
  query_text VARCHAR(1000) NULL,
  position SMALLINT UNSIGNED NULL,
  metadata JSON NULL,
  occurred_at DATETIME(6) NOT NULL,
  KEY ix_interactions_user_time (user_id, occurred_at),
  KEY ix_interactions_anonymous_time (anonymous_key, occurred_at),
  KEY ix_interactions_book_type_time (book_id, event_type, occurred_at),
  KEY ix_interactions_session_time (session_id, occurred_at),
  CONSTRAINT fk_interactions_user FOREIGN KEY (user_id) REFERENCES users (user_id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_interactions_book FOREIGN KEY (book_id) REFERENCES books (book_id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  preferred_subjects JSON NOT NULL,
  preferred_authors JSON NOT NULL,
  min_price DECIMAL(12, 2) NULL,
  max_price DECIMAL(12, 2) NULL,
  profile_version INT UNSIGNED NOT NULL DEFAULT 1,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_user_preferences_user FOREIGN KEY (user_id) REFERENCES users (user_id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS embedding_outbox (
  outbox_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  book_id BINARY(16) NOT NULL,
  content_hash CHAR(64) NOT NULL,
  reason ENUM('created', 'content_changed', 'model_changed', 'retry') NOT NULL,
  status ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  attempt_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  available_at DATETIME(6) NOT NULL,
  locked_at DATETIME(6) NULL,
  last_error TEXT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY ix_embedding_outbox_ready (status, available_at),
  KEY ix_embedding_outbox_book (book_id, status),
  UNIQUE KEY uq_embedding_outbox_book_hash_status (book_id, content_hash, status),
  CONSTRAINT fk_embedding_outbox_book FOREIGN KEY (book_id) REFERENCES books (book_id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS embedding_records (
  book_id BINARY(16) NOT NULL,
  embedding_provider VARCHAR(100) NOT NULL,
  embedding_model VARCHAR(150) NOT NULL,
  embedding_version VARCHAR(50) NOT NULL,
  content_hash CHAR(64) NOT NULL,
  collection_name VARCHAR(200) NOT NULL,
  vector_key VARCHAR(300) NOT NULL,
  status ENUM('active', 'stale', 'failed') NOT NULL,
  generated_at DATETIME(6) NULL,
  error_message TEXT NULL,
  PRIMARY KEY (book_id, embedding_model, embedding_version),
  KEY ix_embedding_records_status (status, embedding_model, embedding_version),
  CONSTRAINT fk_embedding_records_book FOREIGN KEY (book_id) REFERENCES books (book_id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ============================================================
-- Smart Campus Lost and Found Management System
-- Production Database Schema (MySQL 8.x / Clever Cloud / Aiven)
-- ============================================================
-- INSTRUCTIONS:
-- 1. Run this script in your cloud MySQL database ONCE to create all tables.
-- 2. The application will auto-seed categories and demo data on first startup.
-- 3. Do NOT run CREATE DATABASE / USE statements on cloud platforms —
--    they give you a database directly. Skip those lines if already connected.
-- ============================================================

-- Only needed if running locally and the database does not yet exist:
-- CREATE DATABASE IF NOT EXISTS smart_lost_found
--   CHARACTER SET utf8mb4
--   COLLATE utf8mb4_unicode_ci;
-- USE smart_lost_found;

-- ------------------------------------------------------------
-- 1. USERS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  full_name      VARCHAR(100)    NOT NULL,
  email          VARCHAR(150)    NOT NULL,
  phone          VARCHAR(20)     NOT NULL,
  password_hash  VARCHAR(255)    NOT NULL,
  role           ENUM('USER','ADMIN') NOT NULL DEFAULT 'USER',
  user_type      ENUM('STUDENT','FACULTY','STAFF') NOT NULL DEFAULT 'STUDENT',
  department     VARCHAR(100)    NULL,
  college        VARCHAR(150)    NULL,
  created_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_users_email UNIQUE (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 2. CATEGORIES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(50) NOT NULL,
  created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_categories_name UNIQUE (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3. ITEMS (both LOST and FOUND reports live here)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS items (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT           NOT NULL,
  category_id   INT           NOT NULL,
  item_name     VARCHAR(150)  NOT NULL,
  description   TEXT          NULL,
  location      VARCHAR(150)  NOT NULL,
  item_date     DATE          NOT NULL,
  image_url     VARCHAR(500)  NULL,
  type          ENUM('LOST','FOUND') NOT NULL,
  status        ENUM('ACTIVE','MATCHED','CLAIMED','RECOVERED','CLOSED')
                              NOT NULL DEFAULT 'ACTIVE',
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                              ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_items_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_items_category
    FOREIGN KEY (category_id) REFERENCES categories(id)
    ON DELETE RESTRICT,
  INDEX idx_items_type (type),
  INDEX idx_items_status (status),
  INDEX idx_items_category (category_id),
  INDEX idx_items_location (location),
  INDEX idx_items_date (item_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 4. MATCHES (system-generated potential matches)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS matches (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  lost_item_id      INT NOT NULL,
  found_item_id     INT NOT NULL,
  similarity_score  DECIMAL(5,2) NOT NULL,
  match_level       ENUM('HIGH','MEDIUM','LOW') NOT NULL,
  status            ENUM('PENDING','CONFIRMED','DISMISSED')
                                 NOT NULL DEFAULT 'PENDING',
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_matches_lost_item
    FOREIGN KEY (lost_item_id) REFERENCES items(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_matches_found_item
    FOREIGN KEY (found_item_id) REFERENCES items(id)
    ON DELETE CASCADE,
  CONSTRAINT uq_matches_pair UNIQUE (lost_item_id, found_item_id),
  INDEX idx_matches_score (similarity_score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 5. CLAIMS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS claims (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  item_id                INT NOT NULL,
  claimant_id            INT NOT NULL,
  description            TEXT NOT NULL,
  verification_details   TEXT NOT NULL,
  status                 ENUM('PENDING','APPROVED','REJECTED')
                                     NOT NULL DEFAULT 'PENDING',
  admin_comment          TEXT NULL,
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                                     ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_claims_item
    FOREIGN KEY (item_id) REFERENCES items(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_claims_claimant
    FOREIGN KEY (claimant_id) REFERENCES users(id)
    ON DELETE CASCADE,
  INDEX idx_claims_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 6. NOTIFICATIONS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  title       VARCHAR(150) NOT NULL,
  message     VARCHAR(500) NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  INDEX idx_notifications_user_read (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 7. ACTIVITY LOGS (admin "view system activity" screen)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_logs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NULL,
  action      VARCHAR(100) NOT NULL,
  description VARCHAR(500) NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_logs_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Seed: Default categories (only if empty — safe to re-run)
-- ============================================================
INSERT IGNORE INTO categories (name) VALUES
  ('ID Card'), ('Wallet'), ('Mobile Phone'), ('Laptop'),
  ('Charger'), ('Calculator'), ('Books'), ('Bag'),
  ('Keys'), ('Earphones'), ('Watch'), ('Documents'), ('Other');

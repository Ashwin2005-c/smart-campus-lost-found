// config/db.js
// Creates a reusable MySQL connection pool using mysql2/promise
// and provides automated database initialization and seed data.

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Build pool configuration from environment variables only.
// No hardcoded production credentials - the app will fail clearly if env vars are missing.
const poolConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,   // No fallback — must be set in production
  database: process.env.DB_NAME || 'smart_lost_found',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true,
  connectTimeout: 30000
};

// Clever Cloud and some other cloud MySQL providers require SSL.
// Set DB_SSL=true in your environment to enable it.
if (process.env.DB_SSL === 'true') {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = mysql.createPool(poolConfig);

// Helper for executing queries
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

// Seed initial data if tables are empty
async function seedDefaultData() {
  try {
    // 1. Categories
    const [catRows] = await pool.query('SELECT COUNT(*) as count FROM categories');
    if (catRows[0].count === 0) {
      const categories = [
        'ID Card', 'Wallet', 'Mobile Phone', 'Laptop',
        'Charger', 'Calculator', 'Books', 'Bag',
        'Keys', 'Earphones', 'Watch', 'Documents', 'Other'
      ];
      for (const cat of categories) {
        await pool.query('INSERT IGNORE INTO categories (name) VALUES (?)', [cat]);
      }
      console.log('✅ Seeded default categories');
    }

    // 2. Demo Users
    const [userRows] = await pool.query('SELECT COUNT(*) as count FROM users');
    if (userRows[0].count === 0) {
      const adminPasswordHash = bcrypt.hashSync('Admin@123', 10);
      const studentPasswordHash = bcrypt.hashSync('Student@123', 10);
      const facultyPasswordHash = bcrypt.hashSync('Faculty@123', 10);

      // Admin user
      await pool.query(
        `INSERT INTO users (full_name, email, phone, password_hash, role, user_type, department, college)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'Campus Security Admin',
          'admin@campus.edu',
          '+91 98765 43210',
          adminPasswordHash,
          'ADMIN',
          'STAFF',
          'Campus Safety & Administration',
          'Main University Campus'
        ]
      );

      // Student 1 (Alex Carter)
      await pool.query(
        `INSERT INTO users (full_name, email, phone, password_hash, role, user_type, department, college)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'Alex Carter',
          'student@campus.edu',
          '+91 98765 11223',
          studentPasswordHash,
          'USER',
          'STUDENT',
          'Computer Science & Engineering',
          'School of Computing'
        ]
      );

      // Student 2 (Sophia Sharma)
      await pool.query(
        `INSERT INTO users (full_name, email, phone, password_hash, role, user_type, department, college)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'Sophia Sharma',
          'sophia@campus.edu',
          '+91 98765 33445',
          studentPasswordHash,
          'USER',
          'STUDENT',
          'Electronics & Communication',
          'School of Engineering'
        ]
      );

      // Faculty (Dr. Emily Adams)
      await pool.query(
        `INSERT INTO users (full_name, email, phone, password_hash, role, user_type, department, college)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'Dr. Emily Adams',
          'faculty@campus.edu',
          '+91 98765 55667',
          facultyPasswordHash,
          'USER',
          'FACULTY',
          'Information Technology',
          'School of Computing'
        ]
      );

      console.log('✅ Seeded demo users (admin@campus.edu, student@campus.edu, sophia@campus.edu, faculty@campus.edu)');

      // Fetch user IDs
      const [adminUser] = await pool.query('SELECT id FROM users WHERE email = ?', ['admin@campus.edu']);
      const [student1] = await pool.query('SELECT id FROM users WHERE email = ?', ['student@campus.edu']);
      const [student2] = await pool.query('SELECT id FROM users WHERE email = ?', ['sophia@campus.edu']);

      // 3. Demo Items
      const [cats] = await pool.query('SELECT id, name FROM categories');
      const catMap = {};
      cats.forEach(c => { catMap[c.name] = c.id; });

      // Lost Item 1
      const [resLost1] = await pool.query(
        `INSERT INTO items (user_id, category_id, item_name, description, location, item_date, image_url, type, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          student1[0].id,
          catMap['Bag'] || 8,
          'Navy Blue Dell Laptop Backpack',
          'Navy blue backpack with Dell logo, contains MCA notes notebook and blue water bottle inside.',
          'Central Library, 2nd Floor Reading Hall',
          new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString().slice(0, 10),
          null,
          'LOST',
          'ACTIVE'
        ]
      );

      // Found Item 1
      const [resFound1] = await pool.query(
        `INSERT INTO items (user_id, category_id, item_name, description, location, item_date, image_url, type, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          student2[0].id,
          catMap['Bag'] || 8,
          'Dell Navy Blue Backpack',
          'Found a blue Dell backpack left near table #14 in Central Library. Handed over to counter.',
          'Central Library 2nd Floor',
          new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString().slice(0, 10),
          null,
          'FOUND',
          'MATCHED'
        ]
      );

      // Lost Item 2
      const [resLost2] = await pool.query(
        `INSERT INTO items (user_id, category_id, item_name, description, location, item_date, image_url, type, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          student1[0].id,
          catMap['ID Card'] || 1,
          'Student Campus ID Card - Alex Carter',
          'Smart RFID student ID badge with blue lanyard, CSE department roll #MCA2024019.',
          'Campus Cafeteria Food Court',
          new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10),
          null,
          'LOST',
          'ACTIVE'
        ]
      );

      // Found Item 2
      const [resFound2] = await pool.query(
        `INSERT INTO items (user_id, category_id, item_name, description, location, item_date, image_url, type, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          student2[0].id,
          catMap['Calculator'] || 6,
          'Casio fx-991EX Scientific Calculator',
          'Black Casio scientific calculator with silver slide case. Found on bench in Science Block Room 204.',
          'Science Block Room 204',
          new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString().slice(0, 10),
          null,
          'FOUND',
          'ACTIVE'
        ]
      );

      // Found Item 3
      const [resFound3] = await pool.query(
        `INSERT INTO items (user_id, category_id, item_name, description, location, item_date, image_url, type, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          adminUser[0].id,
          catMap['Keys'] || 9,
          'Set of 3 Bike Keys with Spiderman Keychain',
          'Hero Splendor bike key + 2 locker keys with a red silicone Spiderman keychain.',
          'Main Parking Lot Near Gate 2',
          new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString().slice(0, 10),
          null,
          'FOUND',
          'ACTIVE'
        ]
      );

      // 4. Seed an intelligent match between Lost 1 & Found 1
      await pool.query(
        `INSERT INTO matches (lost_item_id, found_item_id, similarity_score, match_level, status)
         VALUES (?, ?, ?, ?, ?)`,
        [resLost1.insertId, resFound1.insertId, 92.50, 'HIGH', 'CONFIRMED']
      );

      // 5. Seed a notification for Student 1
      await pool.query(
        `INSERT INTO notifications (user_id, title, message, is_read)
         VALUES (?, ?, ?, ?)`,
        [
          student1[0].id,
          'High Potential Match Found!',
          'A found item "Dell Navy Blue Backpack" closely matches your lost report "Navy Blue Dell Laptop Backpack" (92% Match Score). Check matches to verify!',
          false
        ]
      );

      // 6. Seed a sample claim by Student 1 on Found 1
      await pool.query(
        `INSERT INTO claims (item_id, claimant_id, description, verification_details, status, admin_comment)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          resFound1.insertId,
          student1[0].id,
          'This is my Dell backpack lost on 2nd floor library.',
          'The front small zipper contains a blue Parker pen and my MCA notes spiral notebook with my name Alex Carter on first page.',
          'PENDING',
          'Pending administrative verification with finder'
        ]
      );

      // 7. Seed initial activity logs
      await pool.query(
        `INSERT INTO activity_logs (user_id, action, description)
         VALUES (?, ?, ?)`,
        [
          adminUser[0].id,
          'SYSTEM_INIT',
          'Smart Campus Lost & Found System initialized with default categories and demo assets.'
        ]
      );

      console.log('✅ Seeded demo campus lost & found items, matches, claims, and activity logs');
    }
  } catch (err) {
    console.error('⚠️ Warning during seedDefaultData:', err.message);
  }
}

// Quick check and auto-init when the server boots.
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ MySQL connected successfully to database:', process.env.DB_NAME || 'smart_lost_found');
    connection.release();
    // Run automated seed
    await seedDefaultData();
  } catch (error) {
    console.error('❌ MySQL connection failed:', error.message);
    // Do not terminate immediately; throw for handling in server.js
    throw error;
  }
}

module.exports = { pool, query, testConnection, seedDefaultData };

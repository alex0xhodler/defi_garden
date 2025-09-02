import Database from "better-sqlite3";
import { DB_PATH } from "../utils/constants";
import fs from "fs";
import path from "path";

const db = new Database(DB_PATH);

/**
 * Run database migrations
 */
export function runMigrations(): void {
  console.log("🚀 Starting database migrations...");

  try {
    // Create migrations table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL UNIQUE,
        executed_at INTEGER NOT NULL
      );
    `);

    // Get list of executed migrations
    const executedMigrations = db
      .prepare("SELECT filename FROM migrations")
      .all() as { filename: string }[];
    
    const executedSet = new Set(executedMigrations.map(m => m.filename));

    // Read migration files
    const migrationsDir = __dirname;
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    let executed = 0;

    // Execute pending migrations
    for (const filename of migrationFiles) {
      if (executedSet.has(filename)) {
        console.log(`⏭️  Skipping already executed migration: ${filename}`);
        continue;
      }

      console.log(`⚡ Executing migration: ${filename}`);
      
      const migrationPath = path.join(migrationsDir, filename);
      const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

      try {
        // Begin transaction
        db.exec('BEGIN TRANSACTION;');

        // Execute migration SQL
        db.exec(migrationSQL);

        // Record migration as executed
        db.prepare(`
          INSERT INTO migrations (filename, executed_at) 
          VALUES (?, ?)
        `).run(filename, Date.now());

        // Commit transaction
        db.exec('COMMIT;');

        console.log(`✅ Migration completed: ${filename}`);
        executed++;

      } catch (error) {
        // Rollback on error
        db.exec('ROLLBACK;');
        console.error(`❌ Migration failed: ${filename}`, error);
        throw error;
      }
    }

    if (executed === 0) {
      console.log("📊 Database is up to date - no migrations needed");
    } else {
      console.log(`🎉 Successfully executed ${executed} migration(s)`);
    }

  } catch (error) {
    console.error("💥 Migration failed:", error);
    throw error;
  } finally {
    db.close();
  }
}

// Allow running migrations directly
if (require.main === module) {
  runMigrations();
}
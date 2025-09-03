"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrations = runMigrations;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const constants_1 = require("../utils/constants");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db = new better_sqlite3_1.default(constants_1.DB_PATH);
/**
 * Run database migrations
 */
function runMigrations() {
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
            .all();
        const executedSet = new Set(executedMigrations.map(m => m.filename));
        // Read migration files
        const migrationsDir = __dirname;
        const migrationFiles = fs_1.default
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
            const migrationPath = path_1.default.join(migrationsDir, filename);
            const migrationSQL = fs_1.default.readFileSync(migrationPath, 'utf-8');
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
            }
            catch (error) {
                // Rollback on error
                db.exec('ROLLBACK;');
                console.error(`❌ Migration failed: ${filename}`, error);
                throw error;
            }
        }
        if (executed === 0) {
            console.log("📊 Database is up to date - no migrations needed");
        }
        else {
            console.log(`🎉 Successfully executed ${executed} migration(s)`);
        }
    }
    catch (error) {
        console.error("💥 Migration failed:", error);
        throw error;
    }
    finally {
        db.close();
    }
}
// Allow running migrations directly
if (require.main === module) {
    runMigrations();
}

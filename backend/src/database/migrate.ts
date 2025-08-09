import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Migration {
  id: number;
  name: string;
  filename: string;
  sql: string;
}

class MigrationRunner {
  private migrationsDir: string;

  constructor() {
    this.migrationsDir = path.join(__dirname, 'migrations');
  }

  async createMigrationsTable(): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          filename VARCHAR(255) NOT NULL,
          executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('Migrations table created or already exists');
    } catch (error) {
      console.error('Error creating migrations table:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getExecutedMigrations(): Promise<string[]> {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT filename FROM migrations ORDER BY id');
      return result.rows.map(row => row.filename);
    } catch (error) {
      console.error('Error getting executed migrations:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getPendingMigrations(): Promise<Migration[]> {
    const executedMigrations = await this.getExecutedMigrations();
    const migrationFiles = fs.readdirSync(this.migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    const pendingMigrations: Migration[] = [];

    for (const filename of migrationFiles) {
      if (!executedMigrations.includes(filename)) {
        const filePath = path.join(this.migrationsDir, filename);
        const sql = fs.readFileSync(filePath, 'utf8');
        const id = parseInt(filename.split('_')[0]);
        const name = filename.replace(/^\d+_/, '').replace('.sql', '');

        pendingMigrations.push({
          id,
          name,
          filename,
          sql
        });
      }
    }

    return pendingMigrations;
  }

  async executeMigration(migration: Migration): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Execute the migration SQL
      await client.query(migration.sql);
      
      // Record the migration as executed
      await client.query(
        'INSERT INTO migrations (name, filename) VALUES ($1, $2)',
        [migration.name, migration.filename]
      );
      
      await client.query('COMMIT');
      console.log(`✓ Executed migration: ${migration.filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`✗ Failed to execute migration: ${migration.filename}`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async runMigrations(): Promise<void> {
    try {
      console.log('Starting database migrations...');
      
      await this.createMigrationsTable();
      const pendingMigrations = await this.getPendingMigrations();

      if (pendingMigrations.length === 0) {
        console.log('No pending migrations found');
        return;
      }

      console.log(`Found ${pendingMigrations.length} pending migration(s)`);

      for (const migration of pendingMigrations) {
        await this.executeMigration(migration);
      }

      console.log('All migrations completed successfully');
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  }

  async rollbackLastMigration(): Promise<void> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM migrations ORDER BY id DESC LIMIT 1'
      );

      if (result.rows.length === 0) {
        console.log('No migrations to rollback');
        return;
      }

      const lastMigration = result.rows[0];
      console.log(`Rolling back migration: ${lastMigration.filename}`);

      // Note: This is a basic rollback that just removes the migration record
      // In a production system, you'd want to have rollback SQL scripts
      await client.query('DELETE FROM migrations WHERE id = $1', [lastMigration.id]);
      
      console.log(`✓ Rolled back migration: ${lastMigration.filename}`);
      console.log('Note: This only removes the migration record. Manual cleanup may be required.');
    } catch (error) {
      console.error('Rollback failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'up';

  const migrationRunner = new MigrationRunner();

  try {
    switch (command) {
      case 'up':
        await migrationRunner.runMigrations();
        break;
      case 'rollback':
        await migrationRunner.rollbackLastMigration();
        break;
      case 'status':
        const pending = await migrationRunner.getPendingMigrations();
        const executed = await migrationRunner.getExecutedMigrations();
        console.log(`Executed migrations: ${executed.length}`);
        console.log(`Pending migrations: ${pending.length}`);
        if (pending.length > 0) {
          console.log('Pending:');
          pending.forEach(m => console.log(`  - ${m.filename}`));
        }
        break;
      default:
        console.log('Usage: npm run db:migrate [up|rollback|status]');
        break;
    }
  } catch (error) {
    console.error('Migration command failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default MigrationRunner;
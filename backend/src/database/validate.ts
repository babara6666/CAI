import pool from './config.js';

interface TableInfo {
  tableName: string;
  columnCount: number;
  indexCount: number;
}

class DatabaseValidator {
  async validateConnection(): Promise<boolean> {
    try {
      const result = await pool.query('SELECT 1 as connected');
      console.log('✓ Database connection successful');
      return result.rows[0].connected === 1;
    } catch (error) {
      console.error('✗ Database connection failed:', error);
      return false;
    }
  }

  async validateTables(): Promise<boolean> {
    try {
      const expectedTables = [
        'users',
        'cad_files',
        'cad_file_versions',
        'datasets',
        'dataset_files',
        'ai_models',
        'search_queries',
        'search_results',
        'user_feedback',
        'audit_logs'
      ];

      const query = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `;

      const result = await pool.query(query);
      const existingTables = result.rows.map(row => row.table_name);

      console.log('\nTable validation:');
      let allTablesExist = true;

      for (const table of expectedTables) {
        if (existingTables.includes(table)) {
          console.log(`✓ Table '${table}' exists`);
        } else {
          console.log(`✗ Table '${table}' missing`);
          allTablesExist = false;
        }
      }

      return allTablesExist;
    } catch (error) {
      console.error('✗ Table validation failed:', error);
      return false;
    }
  }

  async validateEnums(): Promise<boolean> {
    try {
      const expectedEnums = [
        'user_role',
        'file_status',
        'dataset_status',
        'model_status',
        'model_type',
        'query_type'
      ];

      const query = `
        SELECT typname 
        FROM pg_type 
        WHERE typtype = 'e'
        ORDER BY typname
      `;

      const result = await pool.query(query);
      const existingEnums = result.rows.map(row => row.typname);

      console.log('\nEnum validation:');
      let allEnumsExist = true;

      for (const enumType of expectedEnums) {
        if (existingEnums.includes(enumType)) {
          console.log(`✓ Enum '${enumType}' exists`);
        } else {
          console.log(`✗ Enum '${enumType}' missing`);
          allEnumsExist = false;
        }
      }

      return allEnumsExist;
    } catch (error) {
      console.error('✗ Enum validation failed:', error);
      return false;
    }
  }

  async validateIndexes(): Promise<boolean> {
    try {
      const query = `
        SELECT 
          schemaname,
          tablename,
          indexname,
          indexdef
        FROM pg_indexes 
        WHERE schemaname = 'public'
        AND indexname NOT LIKE '%_pkey'
        ORDER BY tablename, indexname
      `;

      const result = await pool.query(query);
      
      console.log('\nIndex validation:');
      console.log(`Found ${result.rows.length} custom indexes`);

      const indexesByTable: Record<string, number> = {};
      result.rows.forEach(row => {
        indexesByTable[row.tablename] = (indexesByTable[row.tablename] || 0) + 1;
      });

      Object.entries(indexesByTable).forEach(([table, count]) => {
        console.log(`✓ Table '${table}' has ${count} indexes`);
      });

      return true;
    } catch (error) {
      console.error('✗ Index validation failed:', error);
      return false;
    }
  }

  async validateConstraints(): Promise<boolean> {
    try {
      const query = `
        SELECT 
          tc.table_name,
          tc.constraint_name,
          tc.constraint_type,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints tc
        LEFT JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        LEFT JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.table_schema = 'public'
        ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name
      `;

      const result = await pool.query(query);
      
      console.log('\nConstraint validation:');
      
      const constraintsByType: Record<string, number> = {};
      result.rows.forEach(row => {
        constraintsByType[row.constraint_type] = (constraintsByType[row.constraint_type] || 0) + 1;
      });

      Object.entries(constraintsByType).forEach(([type, count]) => {
        console.log(`✓ Found ${count} ${type} constraints`);
      });

      return true;
    } catch (error) {
      console.error('✗ Constraint validation failed:', error);
      return false;
    }
  }

  async getTableStatistics(): Promise<TableInfo[]> {
    try {
      const query = `
        SELECT 
          t.table_name,
          COUNT(c.column_name) as column_count,
          COUNT(i.indexname) as index_count
        FROM information_schema.tables t
        LEFT JOIN information_schema.columns c 
          ON t.table_name = c.table_name 
          AND t.table_schema = c.table_schema
        LEFT JOIN pg_indexes i 
          ON t.table_name = i.tablename 
          AND t.table_schema = i.schemaname
        WHERE t.table_schema = 'public' 
        AND t.table_type = 'BASE TABLE'
        GROUP BY t.table_name
        ORDER BY t.table_name
      `;

      const result = await pool.query(query);
      return result.rows.map(row => ({
        tableName: row.table_name,
        columnCount: parseInt(row.column_count),
        indexCount: parseInt(row.index_count)
      }));
    } catch (error) {
      console.error('✗ Failed to get table statistics:', error);
      return [];
    }
  }

  async run(): Promise<boolean> {
    console.log('Starting database validation...\n');

    const connectionValid = await this.validateConnection();
    if (!connectionValid) {
      return false;
    }

    const tablesValid = await this.validateTables();
    const enumsValid = await this.validateEnums();
    const indexesValid = await this.validateIndexes();
    const constraintsValid = await this.validateConstraints();

    const tableStats = await this.getTableStatistics();
    if (tableStats.length > 0) {
      console.log('\nTable statistics:');
      tableStats.forEach(stat => {
        console.log(`  ${stat.tableName}: ${stat.columnCount} columns, ${stat.indexCount} indexes`);
      });
    }

    const allValid = connectionValid && tablesValid && enumsValid && indexesValid && constraintsValid;

    console.log('\n' + '='.repeat(50));
    if (allValid) {
      console.log('✓ Database validation completed successfully!');
    } else {
      console.log('✗ Database validation failed. Please check the errors above.');
    }

    return allValid;
  }
}

// CLI interface
async function main() {
  const validator = new DatabaseValidator();

  try {
    const isValid = await validator.run();
    process.exit(isValid ? 0 : 1);
  } catch (error) {
    console.error('Validation failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default DatabaseValidator;
import { UserModel } from '../models/User.js';
import { CADFileModel } from '../models/CADFile.js';
import { DatasetModel } from '../models/Dataset.js';
import { AIModelModel } from '../models/AIModel.js';
import { UserRegistration } from '../types/index.js';
import pool from './config.js';

class DatabaseSeeder {
  async seedUsers(): Promise<void> {
    console.log('Seeding users...');

    const users: UserRegistration[] = [
      {
        email: 'admin@cadai.com',
        username: 'admin',
        password: 'admin123',
        role: 'admin'
      },
      {
        email: 'engineer@cadai.com',
        username: 'engineer',
        password: 'engineer123',
        role: 'engineer'
      },
      {
        email: 'viewer@cadai.com',
        username: 'viewer',
        password: 'viewer123',
        role: 'viewer'
      }
    ];

    for (const userData of users) {
      try {
        const existingUser = await UserModel.findByEmail(userData.email);
        if (!existingUser) {
          await UserModel.create(userData);
          console.log(`✓ Created user: ${userData.email}`);
        } else {
          console.log(`- User already exists: ${userData.email}`);
        }
      } catch (error) {
        console.error(`✗ Failed to create user ${userData.email}:`, error);
      }
    }
  }

  async seedCADFiles(): Promise<void> {
    console.log('Seeding CAD files...');

    // Get engineer user for file uploads
    const engineer = await UserModel.findByEmail('engineer@cadai.com');
    if (!engineer) {
      console.log('Engineer user not found, skipping CAD file seeding');
      return;
    }

    const cadFiles = [
      {
        filename: 'engine-block-v1.dwg',
        originalName: 'Engine Block V1.dwg',
        fileSize: 2048000,
        mimeType: 'application/dwg',
        uploadedBy: engineer.id,
        tags: ['automotive', 'engine', 'mechanical'],
        projectName: 'Automotive Engine Project',
        partName: 'Engine Block',
        description: 'Main engine block for 4-cylinder automotive engine',
        fileUrl: '/uploads/engine-block-v1.dwg'
      },
      {
        filename: 'transmission-housing.dwg',
        originalName: 'Transmission Housing.dwg',
        fileSize: 1536000,
        mimeType: 'application/dwg',
        uploadedBy: engineer.id,
        tags: ['automotive', 'transmission', 'housing'],
        projectName: 'Automotive Transmission Project',
        partName: 'Transmission Housing',
        description: 'Housing for automatic transmission system',
        fileUrl: '/uploads/transmission-housing.dwg'
      },
      {
        filename: 'brake-disc.step',
        originalName: 'Brake Disc.step',
        fileSize: 512000,
        mimeType: 'application/step',
        uploadedBy: engineer.id,
        tags: ['automotive', 'brake', 'safety'],
        projectName: 'Brake System Project',
        partName: 'Brake Disc',
        description: 'Ventilated brake disc for front wheels',
        fileUrl: '/uploads/brake-disc.step'
      }
    ];

    for (const fileData of cadFiles) {
      try {
        await CADFileModel.create(fileData);
        console.log(`✓ Created CAD file: ${fileData.filename}`);
      } catch (error) {
        console.error(`✗ Failed to create CAD file ${fileData.filename}:`, error);
      }
    }
  }

  async seedDatasets(): Promise<void> {
    console.log('Seeding datasets...');

    const engineer = await UserModel.findByEmail('engineer@cadai.com');
    if (!engineer) {
      console.log('Engineer user not found, skipping dataset seeding');
      return;
    }

    const datasets = [
      {
        name: 'Automotive Parts Dataset',
        description: 'Collection of automotive CAD parts for training',
        createdBy: engineer.id,
        tags: ['automotive', 'training']
      },
      {
        name: 'Mechanical Components Dataset',
        description: 'Various mechanical components and assemblies',
        createdBy: engineer.id,
        tags: ['mechanical', 'components']
      }
    ];

    for (const datasetData of datasets) {
      try {
        const dataset = await DatasetModel.create(datasetData);
        console.log(`✓ Created dataset: ${dataset.name}`);

        // Mark dataset as ready
        await DatasetModel.markAsReady(dataset.id);
      } catch (error) {
        console.error(`✗ Failed to create dataset ${datasetData.name}:`, error);
      }
    }
  }

  async run(): Promise<void> {
    try {
      console.log('Starting database seeding...');

      await this.seedUsers();
      await this.seedCADFiles();
      await this.seedDatasets();

      console.log('Database seeding completed successfully!');
    } catch (error) {
      console.error('Database seeding failed:', error);
      throw error;
    }
  }
}

// CLI interface
async function main() {
  const seeder = new DatabaseSeeder();

  try {
    await seeder.run();
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default DatabaseSeeder;
// ===================================================================================
// IMPORTANT SECURITY NOTICE
// ===================================================================================
// This file is a TEMPLATE for your BACKEND configuration.
//
// A frontend application (like this Angular app) MUST NEVER connect directly to a
// database. All the code you write here is sent to the user's browser, and
// including real database credentials would expose them to the public,
// allowing anyone to access or delete your data.
//
// --- HOW TO USE THIS FILE ---
// 1. Build a backend application (e.g., using Node.js/Express, Python/Django, etc.).
// 2. Copy this configuration structure into your backend project.
// 3. On your secure backend server, replace the placeholder values with your
//    real MySQL database credentials.
// 4. Your Angular frontend will then make HTTP requests (API calls) to your
//    backend, and your backend will securely use these credentials to
//    talk to the database.
// ===================================================================================

/**
 * Defines the structure for database connection configuration.
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/**
 * Placeholder configuration for connecting to a MySQL database.
 * **FOR BACKEND USE ONLY.**
 */
export const DATABASE_CONFIG: DatabaseConfig = {
  /**
   * The hostname or IP address of your database server.
   * Example: '127.0.0.1' for a local database.
   */
  host: 'sistemabd.mysql.dbaas.com.br',

  /**
   * The port number for the MySQL server.
   * Default is 3306.
   */
  port: 3306,

  /**
   * The username for your MySQL database user.
   * This user should have appropriate permissions on the specified database.
   */
  user: 'sistemabd',

  /**
   * The password for the specified MySQL user.
   * In a real backend, this should be loaded from a secure environment variable,
   * not hard-coded.
   */
  password: 'Abc123@',

  /**
   * The name of the database to connect to.
   * Example: 'workforce_portal_db'
   */
  database: 'sistemabd',
};

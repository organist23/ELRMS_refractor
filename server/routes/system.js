const express = require('express');
const db = require('../db');
const { getDbConnectionConfig } = require('../dbConfig');
const mysqldump = require('mysqldump');

const router = express.Router();

// ============================================================
// CONNECTION TEST ROUTE
// ============================================================
router.get('/api/ping', async (req, res) => {
    try {
        await db.execute('SELECT 1');
        res.json({ success: true, message: 'Database connected successfully.' });
    } catch (error) {
        let message = 'Unknown database error.';
        if (error.code === 'ECONNREFUSED') {
            message = 'MySQL is not running. Please start WAMP or XAMPP first.';
        } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            message = 'Access denied. Check DB_USER and DB_PASSWORD in your .env file.';
        } else if (error.code === 'ER_BAD_DB_ERROR') {
            message = 'Database not found on this server. Check DB_NAME and DB_PORT in your .env file. You may be connecting to the wrong MySQL instance.';
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
            message = 'Connection timed out. Check DB_HOST and DB_PORT in your .env file.';
        } else {
            message = error.message;
        }
        res.status(500).json({ success: false, message });
    }
});

// 7. System Utilities
router.get('/api/system/backup', async (req, res) => {
    try {
        const connection = getDbConnectionConfig();
        const dump = await mysqldump({
            connection,
            // DROP TABLE IF EXISTS before each CREATE TABLE, so importing over an existing
            // database replaces it with this snapshot instead of failing on duplicate rows.
            dump: { schema: { table: { dropIfExist: true } } },
        });

        // Wrap schema + data so the file imports into the right database no matter which one
        // is selected in the SQL client (e.g. not information_schema), with FK checks off while
        // tables are dropped/recreated.
        const dbName = '`' + String(connection.database).replace(/`/g, '``') + '`';
        const header = [
            `-- ELRMS database backup`,
            `-- Database: ${dbName}`,
            `-- Created: ${new Date().toISOString()}`,
            `-- Importing this file REPLACES all ELRMS tables in ${dbName} with this snapshot.`,
            '',
            'SET NAMES utf8mb4;',
            'SET FOREIGN_KEY_CHECKS = 0;',
            `CREATE DATABASE IF NOT EXISTS ${dbName} DEFAULT CHARACTER SET utf8mb4;`,
            `USE ${dbName};`,
            '',
        ].join('\n');
        const footer = '\n\nSET FOREIGN_KEY_CHECKS = 1;\n';

        // Combine schema and data for a full backup
        const fullDump = header + '\n' + dump.dump.schema + '\n\n' + dump.dump.data + footer;
        
        res.setHeader('Content-Type', 'application/sql');
        res.setHeader('Content-Disposition', `attachment; filename="elrms_backup_${new Date().toISOString().split('T')[0]}.sql"`);
        res.send(fullDump);
    } catch (error) {
        console.error('Backup Error:', error);
        res.status(500).json({ error: 'Database backup failed: ' + error.message });
    }
});

module.exports = router;

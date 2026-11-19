const express = require('express');
const cors = require('cors');
const db = require('./db');
const bcrypt = require('bcrypt');
const { SALT_ROUNDS } = require('./constants');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// --- AUTO-MIGRATION: Hash plain text passwords on startup ---
async function migratePasswords() {
    try {
        const [users] = await db.execute('SELECT id, password FROM admin_users');
        for (const user of users) {
            const alreadyHashed = user.password && user.password.startsWith('$2b$');
            if (!alreadyHashed) {
                const hashed = await bcrypt.hash(user.password, SALT_ROUNDS);
                await db.execute('UPDATE admin_users SET password = ? WHERE id = ?', [hashed, user.id]);
                console.log(`[Security] Migrated password for user ID: ${user.id}`);
            }
        }
    } catch (err) {
        console.error('[Security] Password migration failed:', err.message);
    }
}
migratePasswords();

// --- ROUTES --- (one file per feature in ./routes; paths are unchanged)
app.use(require('./routes/auth'));
app.use(require('./routes/employees'));
app.use(require('./routes/leaves'));
app.use(require('./routes/accrual'));
app.use(require('./routes/stats'));
app.use(require('./routes/ledger'));
app.use(require('./routes/leaveCard'));
app.use(require('./routes/tardy'));
app.use(require('./routes/monetization'));
app.use(require('./routes/system'));

// Start accepting requests only after the schema migrations have run (they are quick and idempotent).
require('./helpers/migrations').runMigrations(db)
    .catch((err) => console.error('[Migration] failed:', err.message))
    .finally(() => app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}));

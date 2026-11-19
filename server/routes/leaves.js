const express = require('express');
const db = require('../db');
const { balanceSnapshot, insertLedgerEntry } = require('../helpers/ledger');
const { isClosedSql, assertMonthOpen } = require('../helpers/closedMonth');
const { LEAVE_TYPES, MONTH_NAMES } = require('../constants');
const { LEAVE_BALANCE_FIELD, ledgerLeaveCode } = require('../helpers/leaveTypes');

const router = express.Router();

// Filing guard: a leave is locked by the month it is filed in (applied_at, see helpers/closedMonth.js).
// If credits were already generated for this month (or a later one), a leave filed now could never
// be approved or rejected, so filing is refused until the next open month. Server local time, like
// assertMonthOpen.
async function getFilingStatus(connection) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const [logs] = await connection.execute(
        'SELECT month, year FROM accrual_logs WHERE (year > ?) OR (year = ? AND month >= ?) ORDER BY year DESC, month DESC LIMIT 1',
        [year, year, month]
    );
    if (logs.length === 0) return { closed: false, month, year };

    // Filing opens again on the 1st of the month after the latest generated month
    const last = logs[0];
    const openMonth = last.month === 12 ? 1 : last.month + 1;
    const openYear = last.month === 12 ? last.year + 1 : last.year;
    const message = `Filing Locked: Monthly credits for ${MONTH_NAMES[last.month - 1]} ${last.year} are already generated, so this month is closed. ` +
        `A leave filed now could not be approved or rejected. Please file it on or after ${MONTH_NAMES[openMonth - 1]} 1, ${openYear}.`;
    return { closed: true, month, year, closedMonth: last.month, closedYear: last.year, openMonth, openYear, message };
}

router.get('/api/leaves/filing-status', async (req, res) => {
    try {
        res.json(await getFilingStatus(db));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Leave Applications
router.get('/api/leaves/pending', async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT l.*, e.full_name,
                   ${isClosedSql('l.applied_at')} AS is_closed
            FROM leave_applications l
            JOIN employees e ON l.employee_id = e.id
            WHERE l.status = 'Pending Approval'
            ORDER BY l.applied_at DESC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/api/leaves/apply', async (req, res) => {
    let { employee_id, leave_type, date_from, date_to, num_days, reason, inclusive_dates } = req.body;
    try {
        // Convert empty strings to null for DB compatibility
        const clean_from = date_from || null;
        const clean_to = date_to || null;

        if (clean_from && clean_to && new Date(clean_to) < new Date(clean_from)) {
            return res.status(400).json({ error: 'Invalid Date Range: "Date To" cannot be earlier than "Date From".' });
        }

        // Only real leave types, and a positive number of days (0.5 for a half day is fine)
        if (!Object.prototype.hasOwnProperty.call(LEAVE_BALANCE_FIELD, leave_type)) {
            return res.status(400).json({ error: `Unknown leave type: ${leave_type}` });
        }
        const days = Number(num_days);
        if (num_days === '' || num_days === null || num_days === undefined || !Number.isFinite(days) || days <= 0) {
            return res.status(400).json({ error: 'Number of days must be greater than 0.' });
        }

        // Closed month: refuse, otherwise the application would be stuck in Pending Requests
        const filing = await getFilingStatus(db);
        if (filing.closed) return res.status(400).json({ error: filing.message });

        // Validation check for privileges
        const [balanceRows] = await db.execute('SELECT * FROM leave_balances WHERE employee_id = ?', [employee_id]);
        if (balanceRows.length === 0) return res.status(404).json({ error: 'Employee balance not found' });
        
        const balance = balanceRows[0];
        const limits = {
            [LEAVE_TYPES.SPECIAL]: 3,
            [LEAVE_TYPES.FORCE]: 5,
            [LEAVE_TYPES.WELLNESS]: 5,
            [LEAVE_TYPES.SOLO_PARENT]: 7,
            [LEAVE_TYPES.MATERNITY]: 105,
            [LEAVE_TYPES.PATERNITY]: 7,
            [LEAVE_TYPES.SBW]: 30
        };

        if (limits[leave_type]) {
            const field = LEAVE_BALANCE_FIELD[leave_type];
            const current_bal = parseFloat(balance[field]);
            if (parseFloat(num_days) > current_bal) {
                 return res.status(400).json({ error: `Not enough credits in ${leave_type}. Remaining: ${current_bal.toFixed(3)}` });
            }
        }

        await db.execute(
            'INSERT INTO leave_applications (employee_id, leave_type, date_from, date_to, num_days, inclusive_dates, reason, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [employee_id, leave_type, clean_from, clean_to, num_days, inclusive_dates, reason, 'Pending Approval']
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/api/leaves/approve', async (req, res) => {
    const { application_id } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [apps] = await connection.execute('SELECT * FROM leave_applications WHERE id = ? FOR UPDATE', [application_id]);
        if (apps.length === 0) throw new Error('Application not found');
        const app_data = apps[0];
        if (app_data.status !== 'Pending Approval') throw new Error('Only pending applications can be approved');

        // Check if the leave application belongs to a closed month (accrual already generated)
        await assertMonthOpen(connection, app_data.applied_at, 'Approve', 'leave application');

        const field = LEAVE_BALANCE_FIELD[app_data.leave_type];
        
        // --- Split Pay Math ---
        // ADDED 'FOR UPDATE' TO PREVENT RACE CONDITIONS
        const [balances] = await connection.execute('SELECT * FROM leave_balances WHERE employee_id = ? FOR UPDATE', [app_data.employee_id]);
        const bal = balances[0];
        const current_val = parseFloat(bal[field] || 0);
        const requested_days = parseFloat(app_data.num_days || 0);

        let with_pay, without_pay;
        if (requested_days > current_val) {
            with_pay = current_val;
            without_pay = requested_days - current_val;
        } else {
            with_pay = requested_days;
            without_pay = 0;
        }

        await connection.execute(
            `UPDATE leave_balances SET ${field} = ${field} - ?, leave_w_o_pay = leave_w_o_pay + ? WHERE employee_id = ?`,
            [with_pay, without_pay, app_data.employee_id]
        );

        await connection.execute(
            'UPDATE leave_applications SET status = "Approved", with_pay = ?, without_pay = ? WHERE id = ?',
            [with_pay, without_pay, application_id]
        );

        // Snapshots for ledger
        const [new_bal] = await connection.execute('SELECT * FROM leave_balances WHERE employee_id = ?', [app_data.employee_id]);
        const b = new_bal[0];

        const fmt = (n) => parseFloat(parseFloat(n).toFixed(3)).toString();
        const desc = `Leave Approved: ${app_data.leave_type} (${app_data.inclusive_dates}). Status: ${fmt(with_pay)} Paid, ${fmt(without_pay)} Without Pay.`;
        const leave_type_short = ledgerLeaveCode(app_data.leave_type);

        await insertLedgerEntry(connection, app_data.employee_id, desc, balanceSnapshot(b), {
            transaction_type: 'LEAVE',
            leave_type: leave_type_short,
            deducted_with_pay: with_pay,
            deducted_without_pay: without_pay,
            remarks: app_data.reason,
            period_text: app_data.inclusive_dates,
        });

        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

router.post('/api/leaves/undo', async (req, res) => {
    const { application_id } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [apps] = await connection.execute('SELECT * FROM leave_applications WHERE id = ? FOR UPDATE', [application_id]);
        if (apps.length === 0) throw new Error('Application not found');
        const app_data = apps[0];
        if (app_data.status !== 'Approved') throw new Error('Only approved applications can be undone');

        // Check if the leave application belongs to a closed month (accrual already generated)
        await assertMonthOpen(connection, app_data.applied_at, 'Undo', 'leave application');

        const field = LEAVE_BALANCE_FIELD[app_data.leave_type];

        // Reverse the math
        await connection.execute(
            `UPDATE leave_balances SET ${field} = ${field} + ?, leave_w_o_pay = leave_w_o_pay - ? WHERE employee_id = ?`,
            [app_data.with_pay, app_data.without_pay, app_data.employee_id]
        );

        await connection.execute('UPDATE leave_applications SET status = "Pending Approval" WHERE id = ?', [application_id]);

        const [new_bal] = await connection.execute('SELECT * FROM leave_balances WHERE employee_id = ?', [app_data.employee_id]);
        const b = new_bal[0];

        // Build short leave type code consistently with the Approval logic
        const leaveTypeCode = ledgerLeaveCode(app_data.leave_type);
        const restoredDays = parseFloat(app_data.with_pay);

        await insertLedgerEntry(connection, app_data.employee_id, `UNDO APPROVAL: Restored ${restoredDays} days to ${app_data.leave_type}`, balanceSnapshot(b), {
            transaction_type: 'UNDO',
            leave_type: leaveTypeCode,
            deducted_with_pay: restoredDays,
            period_text: app_data.inclusive_dates || null,
        });

        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

router.post('/api/leaves/reject', async (req, res) => {
    const { application_id } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [apps] = await connection.execute('SELECT * FROM leave_applications WHERE id = ? FOR UPDATE', [application_id]);
        if (apps.length === 0) throw new Error('Application not found');
        const app_data = apps[0];
        if (app_data.status !== 'Pending Approval') throw new Error('Only pending applications can be rejected');

        // Check if the leave application belongs to a closed month (accrual already generated)
        await assertMonthOpen(connection, app_data.applied_at, 'Reject', 'leave application');

        if (app_data.leave_type === LEAVE_TYPES.FORCE) {
            // === FORCE LEAVE SPECIAL CASE: Exigency of Service ===
            // Rejected Force Leave days are transferred to Vacation Leave
            const transferDays = parseFloat(app_data.num_days || 0);

            // 1. Deduct from force_leave balance, credit to vacation_leave
            await connection.execute(
                'UPDATE leave_balances SET force_leave = force_leave - ?, vacation_leave = vacation_leave + ? WHERE employee_id = ?',
                [transferDays, transferDays, app_data.employee_id]
            );

            // 2. Reject the application
            await connection.execute('UPDATE leave_applications SET status = "Rejected" WHERE id = ?', [application_id]);

            // 3. Take a fresh snapshot of all balances after the update
            const [new_bal] = await connection.execute('SELECT * FROM leave_balances WHERE employee_id = ?', [app_data.employee_id]);
            const b = new_bal[0];

            // 4. DOUBLE ENTRY LEDGER SYSTEM:
            
            // ENTRY A: Updates the VL Card (The "Credit")
            // Routes to VL Card via leave_type='VL'. Shows as "Earned" via balance diff.
            await insertLedgerEntry(connection, app_data.employee_id, 'VL Transfer (Force Leave Rejected)', balanceSnapshot(b), {
                transaction_type: 'TRANSFER',
                leave_type: 'VL',
                earned: transferDays,
                remarks: 'Exigency of Service: Force Leave transferred to VL',
                period_text: app_data.inclusive_dates || null,
            });

            // ENTRY B: Updates the Privilege Card (The "Debit")
            // Routes to Privilege Card via leave_type='Force Leave'. Shows as "Absence w/ Pay" via balance diff.
            await insertLedgerEntry(connection, app_data.employee_id, 'VL Transfer (Force Leave Rejected)', balanceSnapshot(b), {
                transaction_type: 'TRANSFER',
                leave_type: LEAVE_TYPES.FORCE,
                earned: 0,
                remarks: 'Exigency of Service: Transferred to VL',
                period_text: app_data.inclusive_dates || null,
            });
        } else {
            // === STANDARD REJECTION: No balance changes, simple status update ===
            await connection.execute('UPDATE leave_applications SET status = "Rejected" WHERE id = ?', [application_id]);
        }

        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

router.get('/api/leaves/history', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let countQuery = `
            SELECT COUNT(*) as total 
            FROM leave_applications l
            JOIN employees e ON l.employee_id = e.id
            WHERE l.status != 'Pending Approval'
        `;
        let dataQuery = `
            SELECT l.*, e.full_name,
                   ${isClosedSql('l.applied_at')} AS is_closed
            FROM leave_applications l
            JOIN employees e ON l.employee_id = e.id
            WHERE l.status != 'Pending Approval'
        `;
        
        let queryParams = [];
        
        if (search) {
            const searchTerm = `%${search}%`;
            countQuery += ` AND (e.full_name LIKE ? OR l.employee_id LIKE ?)`;
            dataQuery += ` AND (e.full_name LIKE ? OR l.employee_id LIKE ?)`;
            queryParams.push(searchTerm, searchTerm);
        }
        
        dataQuery += ` ORDER BY l.applied_at DESC LIMIT ${limit} OFFSET ${offset}`;

        const [countRows] = await db.execute(countQuery, queryParams);
        const total = countRows[0].total;

        const [rows] = await db.execute(dataQuery, queryParams);

        res.json({
            data: rows,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

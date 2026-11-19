const express = require('express');
const db = require('../db');
const { balanceSnapshot, insertLedgerEntry } = require('../helpers/ledger');

const router = express.Router();

// ============================================================
// MONETIZATION (New - core logic untouched)
// Deducts monetized VL and/or SL days at any time (not tied to the monthly lock).
// Only one ledger row is written. Its transaction_type 'MONETIZED' is not one of the
// leave card's special types, so the card (helpers/leaveCard.js) shows the drop in each
// balance under VL/SL "Absence w/ Pay", with Remarks "Monetized" and the chosen month as Period.
// Final once recorded: corrections go through Manual Balance Adjustment.
// ============================================================

const FULL_MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

// Number of days from the request: blank means 0, otherwise a finite number >= 0, kept to 3 decimals.
function parseDays(value, label) {
    if (value === undefined || value === null || value === '') return 0;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${label} days must be 0 or more.`);
    return Math.round(n * 1000) / 1000;
}

const fmt = (n) => parseFloat(Number(n).toFixed(3)).toString();

router.post('/api/monetization', async (req, res) => {
    const { employee_id } = req.body;
    let vl, sl, month, year;
    try {
        vl = parseDays(req.body.vl_days, 'VL');
        sl = parseDays(req.body.sl_days, 'SL');
        month = parseInt(req.body.month);
        year = parseInt(req.body.year);
        if (!(month >= 1 && month <= 12)) throw new Error('Please select a valid month.');
        if (!(year >= 2000 && year <= 2100)) throw new Error('Please select a valid year.');
        if (vl === 0 && sl === 0) throw new Error('Enter the VL and/or SL days to monetize.');
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [balRows] = await connection.execute(
            'SELECT * FROM leave_balances WHERE employee_id = ? FOR UPDATE',
            [employee_id]
        );
        if (balRows.length === 0) throw new Error('Employee balance not found');
        const bal = balRows[0];
        const currentVL = parseFloat(bal.vacation_leave || 0);
        const currentSL = parseFloat(bal.sick_leave || 0);

        // Monetized days must be paid from credits: never more than the current balance
        if (vl > currentVL + 1e-9) throw new Error(`Not enough VL to monetize ${fmt(vl)} days. Current VL: ${currentVL.toFixed(3)}`);
        if (sl > currentSL + 1e-9) throw new Error(`Not enough SL to monetize ${fmt(sl)} days. Current SL: ${currentSL.toFixed(3)}`);

        await connection.execute(
            'UPDATE leave_balances SET vacation_leave = vacation_leave - ?, sick_leave = sick_leave - ? WHERE employee_id = ?',
            [vl, sl, employee_id]
        );

        const [newBal] = await connection.execute('SELECT * FROM leave_balances WHERE employee_id = ?', [employee_id]);
        const b = newBal[0];

        const parts = [];
        if (vl > 0) parts.push(`VL ${fmt(vl)}`);
        if (sl > 0) parts.push(`SL ${fmt(sl)}`);
        const leaveType = vl > 0 && sl > 0 ? 'VL/SL' : (vl > 0 ? 'VL' : 'SL');
        const periodText = `${FULL_MONTHS[month - 1]} ${year}`;

        await insertLedgerEntry(connection, employee_id, `Monetization - ${parts.join(' / ')}`, balanceSnapshot(b), {
            transaction_type: 'MONETIZED',
            leave_type: leaveType,
            deducted_with_pay: vl + sl,
            remarks: 'Monetized',
            period_text: periodText,
        });

        await connection.commit();
        res.json({ success: true, message: `Monetized ${parts.join(' and ')} day(s) for ${periodText}.` });
    } catch (error) {
        await connection.rollback();
        res.status(400).json({ error: error.message });
    } finally {
        connection.release();
    }
});

module.exports = router;

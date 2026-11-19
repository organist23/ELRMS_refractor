import React, { useState } from 'react';
import { X, Banknote } from 'lucide-react';
import api from '../../utils/api';
import { useNotification } from '../../context/NotificationContext';

// Monetization: deduct monetized VL and/or SL days at any time (not tied to the monthly lock).
// Shown on the leave card under VL/SL "Absence w/ Pay" with Remarks "Monetized". Final once saved.
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

const MonetizeModal = ({ employee, onClose, onSuccess }) => {
  const { showToast, confirm } = useNotification();
  const now = new Date();
  const thisYear = now.getFullYear();

  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(thisYear);
  const [vlDays, setVlDays] = useState('');
  const [slDays, setSlDays] = useState('');
  const [processing, setProcessing] = useState(false);

  const currentVL = parseFloat(employee.vacation_leave || 0);
  const currentSL = parseFloat(employee.sick_leave || 0);
  const vl = vlDays === '' ? 0 : parseFloat(vlDays);
  const sl = slDays === '' ? 0 : parseFloat(slDays);

  const vlInvalid = Number.isNaN(vl) || vl < 0;
  const slInvalid = Number.isNaN(sl) || sl < 0;
  const vlOver = !vlInvalid && vl > currentVL + 1e-9;
  const slOver = !slInvalid && sl > currentSL + 1e-9;
  const nothing = !vlInvalid && !slInvalid && vl === 0 && sl === 0;
  const blockSubmit = vlInvalid || slInvalid || vlOver || slOver || nothing || processing;
  const showPreview = !vlInvalid && !slInvalid && !nothing;

  const fmt = (n) => parseFloat(Number(n).toFixed(3)).toString();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (blockSubmit) return;

    const parts = [vl > 0 && `${fmt(vl)} VL`, sl > 0 && `${fmt(sl)} SL`].filter(Boolean).join(' and ');
    const confirmed = await confirm(
      'Confirm Monetization',
      `Monetize ${parts} day(s) of ${employee.full_name} for ${MONTHS[month - 1]} ${year}? This creates a permanent ledger record and cannot be undone.`
    );
    if (!confirmed) return;

    try {
      setProcessing(true);
      const { data } = await api.post('/monetization', {
        employee_id: employee.id,
        month,
        year,
        vl_days: vl,
        sl_days: sl
      });
      showToast(data?.message || 'Monetization recorded.', 'success');
      onSuccess();
      onClose();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to record monetization', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const balanceBox = (label, value) => (
    <div style={{
      background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: '10px',
      padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    }}>
      <span className="font-bold text-small" style={{ color: 'var(--accent)' }}>{label}</span>
      <span className="font-bold" style={{ fontSize: '1.1rem', color: 'var(--accent)' }}>{value.toFixed(3)}</span>
    </div>
  );

  const overMsg = (label, bal) => (
    <p style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '4px', fontWeight: 600 }}>
      ⚠ Not enough {label}. Current {label}: {bal.toFixed(3)}
    </p>
  );

  return (
    <div className="modal-overlay">
      <div className="modal-content fade-in" style={{ maxWidth: '520px' }}>
        <div className="flex-between mb-32">
          <div>
            <h2 className="font-bold mb-4" style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Banknote size={22} style={{ color: 'var(--accent)' }} />
              Monetize VL / SL
            </h2>
            <p className="text-small text-muted font-bold">For: {employee.full_name}</p>
          </div>
          <button onClick={onClose} className="icon-btn"><X size={24} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
          {balanceBox('Current VL', currentVL)}
          {balanceBox('Current SL', currentSL)}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="label">Month</label>
              <select className="input-field" value={month} onChange={e => setMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Year</label>
              <select className="input-field" value={year} onChange={e => setYear(Number(e.target.value))}>
                {[thisYear - 1, thisYear, thisYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="label">VL Days</label>
              <input
                type="number" className="input-field" step="0.001" min="0" placeholder="0"
                value={vlDays} onChange={e => setVlDays(e.target.value)}
                style={{ borderColor: (vlOver || vlInvalid) ? '#dc2626' : '', fontWeight: 'bold' }}
                autoFocus
              />
              {vlOver && overMsg('VL', currentVL)}
            </div>
            <div className="form-group">
              <label className="label">SL Days</label>
              <input
                type="number" className="input-field" step="0.001" min="0" placeholder="0"
                value={slDays} onChange={e => setSlDays(e.target.value)}
                style={{ borderColor: (slOver || slInvalid) ? '#dc2626' : '', fontWeight: 'bold' }}
              />
              {slOver && overMsg('SL', currentSL)}
            </div>
          </div>

          {showPreview && (
            <div style={{
              background: (vlOver || slOver) ? '#fef2f2' : '#f0fdf4',
              border: `1px solid ${(vlOver || slOver) ? '#fca5a5' : '#86efac'}`,
              borderRadius: '10px', padding: '12px 16px', marginBottom: '24px',
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
              color: (vlOver || slOver) ? '#dc2626' : '#16a34a'
            }}>
              <span className="font-bold text-small">VL After: {Math.max(0, currentVL - vl).toFixed(3)}</span>
              <span className="font-bold text-small">SL After: {Math.max(0, currentSL - sl).toFixed(3)}</span>
              <span className="text-small" style={{ gridColumn: '1 / -1', opacity: 0.85 }}>
                Leave card: Absence w/ Pay, Period "{MONTHS[month - 1]} {year}", Remarks "Monetized"
              </span>
            </div>
          )}

          <div className="flex-between" style={{ gap: '16px', marginTop: '8px' }}>
            <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button
              type="submit" className="btn-primary"
              style={{ flex: 1.5, opacity: blockSubmit ? 0.5 : 1, cursor: blockSubmit ? 'not-allowed' : 'pointer' }}
              disabled={blockSubmit}
            >
              <Banknote size={16} />
              {processing ? 'Processing...' : 'Confirm Monetize'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MonetizeModal;

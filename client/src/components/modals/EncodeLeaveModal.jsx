import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { X, Calendar } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import { countLeaveDays, CALENDAR_DAY_LEAVES } from '../../utils/leaveDays';

const EncodeLeaveModal = ({ employee, onClose, onSuccess }) => {
  const { showToast } = useNotification();
  const [leaveData, setLeaveData] = useState({
    employee_id: employee.id,
    leave_type: 'Vacation Leave',
    date_from: '',
    date_to: '',
    inclusive_dates: '',
    num_days: 1,
    reason: ''
  });

  // Closed month: once this month's credits are generated, a leave filed now could never be
  // approved or rejected, so the server refuses it. Ask first so the form can warn up front.
  const [filingStatus, setFilingStatus] = useState(null);
  useEffect(() => {
    api.get('/leaves/filing-status')
      .then(res => setFilingStatus(res.data))
      .catch(() => setFilingStatus(null)); // unknown: the server still checks on submit
  }, []);
  const filingLocked = filingStatus?.closed === true;

  const earnedLeaves = ['Vacation Leave', 'Sick Leave'];
  const privilegeLeaves = ['Special Leave', 'Force Leave', 'Wellness Leave', 'Solo Parent Leave', 'Maternity Leave', 'Paternity Leave', 'Special Benefits for Women']
    .filter(l => {
      if (employee.sex === 'Male') {
        return l !== 'Maternity Leave' && l !== 'Special Benefits for Women';
      }
      if (employee.sex === 'Female') {
        return l !== 'Paternity Leave';
      }
      return true;
    });

  // Smart Parser for non-contiguous dates
  const parseInclusiveDates = (str) => {
    if (!str) return 0;
    // Regex to find single numbers and ranges (e.g. 5, 8-10, 27)
    const matches = str.match(/(\d+-\d+|\d+)/g);
    if (!matches) return 0;

    let total = 0;
    matches.forEach(match => {
      if (match.includes('-')) {
        const [start, end] = match.split('-').map(Number);
        if (start && end && end >= start) {
          total += (end - start) + 1;
        }
      } else {
        total += 1;
      }
    });
    return total;
  };

  const handleDateChange = (field, value) => {
    const newData = { ...leaveData, [field]: value };
    
    // 1. If date range changes, suggest inclusive dates
    if ((field === 'date_from' || field === 'date_to') && newData.date_from && newData.date_to) {
      const start = new Date(newData.date_from);
      const end = new Date(newData.date_to);

      // Update num_days based on range (Sundays excluded, see utils/leaveDays.js)
      newData.num_days = countLeaveDays(newData.date_from, newData.date_to, newData.leave_type);
      
      // Update string suggest
      const startMonth = start.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
      const endMonth = end.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
      
      if (startMonth === endMonth && start.getFullYear() === end.getFullYear()) {
        const startDay = start.getDate();
        const endDay = end.getDate();
        newData.inclusive_dates = startDay === endDay ? `${startMonth} ${startDay}` : `${startMonth} ${startDay}-${endDay}`;
      } else {
        const options = { month: 'short', day: 'numeric' };
        newData.inclusive_dates = `${start.toLocaleDateString('en-US', options).toUpperCase()} - ${end.toLocaleDateString('en-US', options).toUpperCase()}`;
      }
    }

    // 2. If Inclusive Dates string is manually edited, re-calculate num_days
    if (field === 'inclusive_dates') {
      const count = parseInclusiveDates(value);
      if (count > 0) newData.num_days = count;
    }

    setLeaveData(newData);
  };

  // Switching to or from a calendar-day leave (Maternity) changes whether Sundays count
  const handleLeaveTypeChange = (leave_type) => {
    const newData = { ...leaveData, leave_type };
    const countingChanged = CALENDAR_DAY_LEAVES.includes(leave_type) !== CALENDAR_DAY_LEAVES.includes(leaveData.leave_type);
    if (countingChanged && newData.date_from && newData.date_to) {
      newData.num_days = countLeaveDays(newData.date_from, newData.date_to, leave_type);
    }
    setLeaveData(newData);
  };

  // Wellness Leave first-application policy check
  // First application = balance is still at full default (5 days)
  const isFirstWellness = leaveData.leave_type === 'Wellness Leave' && Number(employee.wellness_leave) === 5;
  const wellnessWarning = isFirstWellness && (leaveData.num_days > 3 || leaveData.num_days < 1);
  const isInvalidRange = leaveData.date_from && leaveData.date_to && new Date(leaveData.date_to) < new Date(leaveData.date_from);
  // A range made only of Sundays gives 0 leave days
  const isSundayOnly = !isInvalidRange && Number(leaveData.num_days) < 1;
  const blockSubmit = filingLocked || wellnessWarning || isInvalidRange || isSundayOnly;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (blockSubmit) return; // Guard
    try {
      await api.post('/leaves/apply', leaveData);
      showToast('Leave application submitted for approval', 'success');
      onSuccess();
      onClose();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to submit leave application', 'error');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content fade-in" style={{ maxWidth: '600px' }}>
        <div className="flex-between mb-32">
          <div>
            <h2 className="font-bold mb-4" style={{ fontSize: '1.5rem' }}>Encode Leave Application</h2>
            <p className="text-small text-muted font-bold">For: {employee.full_name}</p>
          </div>
          <button onClick={onClose} className="icon-btn"><X size={24} /></button>
        </div>

        {filingLocked && (
          <div
            role="alert"
            style={{
              background: '#fef2f2', border: '1px solid #fecaca', borderLeft: '4px solid #dc2626',
              color: '#991b1b', borderRadius: '8px', padding: '12px 16px', marginTop: '-16px', marginBottom: '24px',
              fontSize: '0.8125rem', fontWeight: 600, lineHeight: 1.5
            }}
          >
            ⚠ {filingStatus.message}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="label">Type of Leave</label>
            <select 
              className="input-field" 
              value={leaveData.leave_type} 
              onChange={e => handleLeaveTypeChange(e.target.value)}
            >
              <optgroup label="Earned Credits">
                {earnedLeaves.map(l => <option key={l} value={l}>{l}</option>)}
              </optgroup>
              <optgroup label="Privilege Leaves">
                {privilegeLeaves.map(l => <option key={l} value={l}>{l}</option>)}
              </optgroup>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div className="form-group">
              <label className="label">Date From</label>
              <input 
                type="date" 
                className="input-field" 
                style={{ borderColor: isInvalidRange ? '#dc2626' : '' }}
                value={leaveData.date_from} 
                onChange={e => handleDateChange('date_from', e.target.value)} 
              />
            </div>
            <div className="form-group">
              <label className="label">Date To</label>
              <input 
                type="date" 
                className="input-field" 
                style={{ borderColor: isInvalidRange ? '#dc2626' : '' }}
                value={leaveData.date_to} 
                onChange={e => handleDateChange('date_to', e.target.value)} 
              />
            </div>
          </div>

          {isInvalidRange && (
            <p style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '-12px', marginBottom: '16px', fontWeight: 600 }}>
              ⚠ Invalid Range: "Date To" cannot be earlier than "Date From".
            </p>
          )}

          <div className="form-group">
            <label className="label">Inclusive Dates</label>
            <input 
              type="text" 
              className="input-field" 
              required 
              placeholder="SEPT 8, 27, 28-29"
              value={leaveData.inclusive_dates} 
              onChange={e => handleDateChange('inclusive_dates', e.target.value)} 
            />
          </div>

          <div className="form-group">
            <label className="label">Number of Days</label>
            <input 
              type="text" 
              className="input-field" 
              readOnly
              value={leaveData.num_days} 
              style={{ 
                borderColor: wellnessWarning ? '#dc2626' : '',
                backgroundColor: '#f8fafc',
                cursor: 'not-allowed',
                fontWeight: 'bold',
                color: 'var(--primary)'
              }}
            />
            {wellnessWarning && (
              <p style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '6px', fontWeight: 600, lineHeight: 1.4 }}>
                ⚠ Wellness Leave Policy: The first application is limited to a maximum of 3 days (minimum of 1 day).
              </p>
            )}
            {isSundayOnly && !wellnessWarning && (
              <p style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '6px', fontWeight: 600, lineHeight: 1.4 }}>
                ⚠ The selected dates fall on Sunday only. Sundays are not counted as leave days.
              </p>
            )}
          </div>

          <div className="form-group">
            <label className="label">Reason / Details</label>
            <textarea 
              className="input-field" 
              style={{ minHeight: '100px', resize: 'vertical' }}
              value={leaveData.reason} 
              onChange={e => setLeaveData({...leaveData, reason: e.target.value})}
              placeholder="e.g. Illness, Vacation, etc."
            />
          </div>

          <div className="flex-between" style={{ marginTop: '40px', gap: '16px' }}>
            <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button 
              type="submit" 
              className="btn-primary" 
              style={{ flex: 1.5, opacity: blockSubmit ? 0.5 : 1, cursor: blockSubmit ? 'not-allowed' : 'pointer' }}
              disabled={blockSubmit}
            >
              <Calendar size={18} />
              Submit Application
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EncodeLeaveModal;

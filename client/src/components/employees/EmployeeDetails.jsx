import React from 'react';
import { RefreshCw, Trash2, Edit, Users, FileText, Clock, FilePlus, Banknote } from 'lucide-react';
import PrivilegeTiles from '../PrivilegeTiles';

// Employee Management: right card with the selected employee's details, actions and leave credits.
const EmployeeDetails = ({ selectedEmp, audit, yearlyHistory, navigate, handleDeleteEmployee, setIsEditModalOpen, setIsLeaveModalOpen, setIsTardyModalOpen, setIsMonetizeModalOpen }) => (
  <div className="premium-card" style={{ height: 'fit-content', position: 'sticky', top: '40px', padding: '32px' }}>
    {selectedEmp ? (
      <div>
        <div className="flex-between mb-24">
          <h3 className="font-bold" style={{ fontSize: '1.25rem' }}>Employee Details</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="icon-btn" onClick={() => navigate(`/employees/${selectedEmp.id}/leave-card`)} title="View Leave Card Report" style={{ color: 'var(--accent)', padding: '6px' }}>
              <FileText size={26} />
            </button>
            <button className="icon-btn" onClick={() => setIsEditModalOpen(true)} title="Edit Profile">
              <Edit size={14} />
            </button>
            <button className="icon-btn" style={{ color: '#ef4444' }} onClick={handleDeleteEmployee} title="Archive Employee">
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div className="mb-24">
          <p className="font-bold" style={{ fontSize: '1.4rem', lineHeight: '1.1', marginBottom: '4px' }}>{selectedEmp.full_name}</p>
          <p className="text-muted text-small font-bold" style={{ letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.7rem' }}>{selectedEmp.id} • {selectedEmp.position}</p>

          <button
            className="btn-primary w-full flex items-center justify-center gap-10"
            style={{
              marginTop: '20px',
              padding: '12px',
              opacity: audit?.pendingRollover ? 0.6 : 1,
              cursor: audit?.pendingRollover ? 'not-allowed' : 'pointer'
            }}
            onClick={() => !audit?.pendingRollover && setIsLeaveModalOpen(true)}
            title={audit?.pendingRollover ? "Rollover Required" : "Encode Leave"}
          >
            {audit?.pendingRollover ? "Rollover Required..." : (
              <>
                <FilePlus size={18} />
                Encode Leave Application
              </>
            )}
          </button>

          {/* NEW: Deduct Equivalent Day Button */}
          <button
            className="btn-secondary w-full flex items-center justify-center gap-10"
            style={{ marginTop: '10px', padding: '10px' }}
            onClick={() => setIsTardyModalOpen(true)}
            title="Deduct Equivalent Day from VL"
          >
            <Clock size={16} />
            Deduct For Tardy
          </button>

          {/* Monetization: deduct monetized VL/SL days at any time */}
          <button
            className="btn-secondary w-full flex items-center justify-center gap-10"
            style={{ marginTop: '10px', padding: '10px' }}
            onClick={() => setIsMonetizeModalOpen(true)}
            title="Monetize VL / SL credits"
          >
            <Banknote size={16} />
            Monetize VL / SL
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 12px', marginBottom: '32px' }}>
          <div className="info-item">
            <label className="label" style={{ fontSize: '0.6rem', opacity: 0.7 }}>Civil Status</label>
            <span className="font-bold" style={{ fontSize: '0.85rem' }}>{selectedEmp.civil_status || 'N/A'}</span>
          </div>
          <div className="info-item">
            <label className="label" style={{ fontSize: '0.6rem', opacity: 0.7 }}>TIN</label>
            <span className="font-bold" style={{ fontSize: '0.85rem' }}>{selectedEmp.tin || 'N/A'}</span>
          </div>
          <div className="info-item">
            <label className="label" style={{ fontSize: '0.6rem', opacity: 0.7 }}>GSIS Policy</label>
            <span className="font-bold" style={{ fontSize: '0.85rem' }}>{selectedEmp.gsis_policy || 'N/A'}</span>
          </div>
          <div className="info-item">
            <label className="label" style={{ fontSize: '0.6rem', opacity: 0.7 }}>Status</label>
            <span className="badge badge-approved" style={{ fontSize: '0.65rem', padding: '2px 8px' }}>{selectedEmp.status}</span>
          </div>
          <div className="info-item">
            <label className="label" style={{ fontSize: '0.6rem', opacity: 0.7 }}>Entrance of Duty</label>
            <span className="font-bold" style={{ fontSize: '0.85rem' }}>{new Date(selectedEmp.entrance_of_duty).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
          <div className="info-item">
            <label className="label" style={{ fontSize: '0.6rem', opacity: 0.7 }}>Office</label>
            <span className="font-bold" style={{ fontSize: '0.85rem' }}>{selectedEmp.office}</span>
          </div>
        </div>

        <h4 className="font-bold mb-12" style={{ fontSize: '0.75rem', color: 'var(--secondary)', borderBottom: '1px solid var(--border)', paddingBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.8 }}>Leave Credits</h4>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ background: 'var(--primary-light)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <div className="flex-between mb-4">
              <span className="font-bold" style={{ fontSize: '0.75rem', color: 'var(--secondary)' }}>Vacation Leave (VL)</span>
              <span className="font-bold" style={{ fontSize: '1.15rem', color: 'var(--primary)' }}>{parseFloat(selectedEmp.vacation_leave || 0).toFixed(3)}</span>
            </div>
            <div className="flex-between text-small text-muted font-bold" style={{ fontSize: '0.7rem' }}>
              <span style={{ opacity: 0.7 }}>Forwarded: {parseFloat(selectedEmp.forwarded_vl || 0).toFixed(3)}</span>
            </div>
          </div>

          <div style={{ background: 'var(--primary-light)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <div className="flex-between mb-4">
              <span className="font-bold" style={{ fontSize: '0.75rem', color: 'var(--secondary)' }}>Sick Leave (SL)</span>
              <span className="font-bold" style={{ fontSize: '1.15rem', color: 'var(--primary)' }}>{parseFloat(selectedEmp.sick_leave || 0).toFixed(3)}</span>
            </div>
            <div className="flex-between text-small text-muted font-bold" style={{ fontSize: '0.7rem' }}>
              <span style={{ opacity: 0.7 }}>Forwarded: {parseFloat(selectedEmp.forwarded_sl || 0).toFixed(3)}</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <PrivilegeTiles
              employee={selectedEmp}
              allDefaultZero
              tileStyle={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px' }}
              labelStyle={{ fontSize: '0.55rem', opacity: 0.7 }}
              valueStyle={{ fontSize: '0.9rem' }}
            />
          </div>

          {yearlyHistory.length > 0 && (
            <div style={{ marginTop: '32px' }}>
              <h4 className="font-bold mb-16" style={{ fontSize: '0.8125rem', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase' }}>
                <RefreshCw size={14} />
                Credits Forwarded (Prev. Year)
              </h4>
              <div className="flex flex-col gap-10">
                <div className="flex-between" style={{ padding: '10px 14px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                  <span className="font-bold text-small">{yearlyHistory[0].year}</span>
                  <span className="text-small text-muted font-bold">VL: {parseFloat(yearlyHistory[0].vl_forwarded).toFixed(3)} | SL: {parseFloat(yearlyHistory[0].sl_forwarded).toFixed(3)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    ) : (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
        <Users size={48} style={{ margin: '0 auto 16px', display: 'block', opacity: 0.2 }} />
        <p>Select an employee from the list to view credits and details.</p>
      </div>
    )}
  </div>
);

export default EmployeeDetails;

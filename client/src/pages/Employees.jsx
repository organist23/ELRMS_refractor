import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { UserPlus } from 'lucide-react';
import MonthlyCreditsPanel from '../components/employees/MonthlyCreditsPanel';
import { CreditGuardNotice, CreditGuardModal, guardIssues } from '../components/employees/CreditGuard';
import EmployeeList from '../components/employees/EmployeeList';
import EmployeeDetails from '../components/employees/EmployeeDetails';
import RegisterEmployeeModal from '../components/modals/RegisterEmployeeModal';
import EditEmployeeModal from '../components/modals/EditEmployeeModal';
import EncodeLeaveModal from '../components/modals/EncodeLeaveModal';
import EquivalentDayModal from '../components/modals/EquivalentDayModal';
import { useNotification } from '../context/NotificationContext';

const Employees = () => {
  const navigate = useNavigate();
  const { showToast, confirm, showUndoToast } = useNotification();
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [isRegModalOpen, setIsRegModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isTardyModalOpen, setIsTardyModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [yearlyHistory, setYearlyHistory] = useState([]);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEmployees, setTotalEmployees] = useState(0);

  // Debounce Search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1); // Reset to page 1 on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Accrual State
  const [accrualMonth, setAccrualMonth] = useState(new Date().getMonth() + 1);
  const [accrualYear, setAccrualYear] = useState(new Date().getFullYear());
  const [audit, setAudit] = useState(null);
  const [precheck, setPrecheck] = useState(null); // what generating credits now would lock
  const [isGuardOpen, setIsGuardOpen] = useState(false);

  const fetchAudit = async () => {
    try {
      const { data } = await api.get('/system/audit');
      setAudit(data);
      // Auto-sync the display values with server-side time
      if (data.month) setAccrualMonth(data.month);
      if (data.year) setAccrualYear(data.year);
      if (data.pendingAccrual) {
        try {
          const { data: pc } = await api.get('/accrual/precheck', { params: { month: data.month, year: data.year } });
          setPrecheck(pc);
        } catch (err) {
          setPrecheck(null); // the notice is optional; generating still works without it
        }
      } else {
        setPrecheck(null);
      }
    } catch (err) {
      console.error('Audit failed', err);
    }
  };

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const { data: res } = await api.get(`/employees?page=${currentPage}&search=${debouncedSearch}`);
      setEmployees(res.data);
      setTotalPages(res.totalPages);
      setTotalEmployees(res.total);

      if (selectedEmp) {
        const updated = res.data.find(e => e.id === selectedEmp.id);
        if (updated) setSelectedEmp(updated);
      }
    } catch (err) {
      console.error('Error fetching employees', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchYearlyHistory = async (empId) => {
    try {
      const { data } = await api.get(`/employees/${empId}/yearly-history`);
      setYearlyHistory(data);
    } catch (err) {
      console.error('Error fetching yearly history', err);
    }
  };

  useEffect(() => {
    fetchEmployees();
    fetchAudit();
  }, [currentPage, debouncedSearch]);

  useEffect(() => {
    if (selectedEmp) {
      fetchYearlyHistory(selectedEmp.id);
    }
  }, [selectedEmp?.id]);

  const handleGenerateCredits = async () => {
    if (!audit || audit.pendingAccrual === false) return; // this month is already generated (or not checked yet)
    // Something would be locked or it is early: show the animated confirmation instead of the plain one
    if (guardIssues(audit, precheck)) {
      setIsGuardOpen(true);
      return;
    }
    const isConfirmed = await confirm(
      'Generate Credits',
      `Are you sure you want to generate 1.25 VL/SL credits for all employees for ${accrualMonth}/${accrualYear}?`
    );
    if (!isConfirmed) return;
    await runGenerateCredits();
  };

  const runGenerateCredits = async () => {
    setIsGuardOpen(false);
    setIsGenerating(true);
    try {
      const { data } = await api.post('/accrual/generate', { month: accrualMonth, year: accrualYear });
      showToast(data.message, 'success');
      fetchEmployees();
      fetchAudit();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to generate credits', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  // Privilege Reset is now combined with Yearly Rollover.
  // Individual adjustments can be made via the Edit Profile modal.

  const handleDeleteEmployee = async () => {
    if (!selectedEmp) return;

    const isConfirmed = await confirm(
      'Archive Employee',
      `Are you sure you want to delete ${selectedEmp.full_name}? Their records will be moved to the inactive archive for audit history.`
    );

    if (!isConfirmed) return;

    // Show Undo UI for 6 seconds
    const proceed = await showUndoToast(`Archiving ${selectedEmp.full_name}...`, 6000);
    
    if (!proceed) return; // Action was undone

    try {
      await api.delete(`/employees/${selectedEmp.id}`);
      showToast('Employee archived and history preserved.', 'success');
      setSelectedEmp(null);
      fetchEmployees();
    } catch (err) {
      showToast('Failed to archive employee', 'error');
    }
  };

  // Client-side filter is removed in favor of server-side search
  // but we keep the variable name 'filtered' to avoid changing too much JSX
  const filtered = employees;

  return (
    <div className="fade-in">
      <header className="flex-between mb-32">
        <div>
          <h1 className="font-bold mb-8" style={{ fontSize: '2.25rem' }}>Employee Management</h1>
          <p className="text-muted">Manage employee profiles and update leave credits.</p>
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <button className="btn-primary" onClick={() => setIsRegModalOpen(true)}>
            <UserPlus size={18} />
            Register New
          </button>
        </div>
      </header>

      {/* Accrual Control Box */}
      <MonthlyCreditsPanel
        accrualMonth={accrualMonth}
        accrualYear={accrualYear}
        isGenerating={isGenerating}
        audit={audit}
        precheck={precheck}
        handleGenerateCredits={handleGenerateCredits}
      />
      <CreditGuardNotice audit={audit} precheck={precheck} onReview={() => navigate('/leaves')} />
      {isGuardOpen && precheck && (
        <CreditGuardModal
          precheck={precheck}
          onClose={() => setIsGuardOpen(false)}
          onReview={() => { setIsGuardOpen(false); navigate('/leaves'); }}
          onGenerate={runGenerateCredits}
        />
      )}


      <div className="employee-layout-grid">
        {/* Left Side: List */}
        <EmployeeList
          search={search}
          setSearch={setSearch}
          debouncedSearch={debouncedSearch}
          filtered={filtered}
          employees={employees}
          totalEmployees={totalEmployees}
          selectedEmp={selectedEmp}
          setSelectedEmp={setSelectedEmp}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          totalPages={totalPages}
          loading={loading}
        />

        {/* Right Side: Details */}
        <EmployeeDetails
          selectedEmp={selectedEmp}
          audit={audit}
          yearlyHistory={yearlyHistory}
          navigate={navigate}
          handleDeleteEmployee={handleDeleteEmployee}
          setIsEditModalOpen={setIsEditModalOpen}
          setIsLeaveModalOpen={setIsLeaveModalOpen}
          setIsTardyModalOpen={setIsTardyModalOpen}
        />
      </div>

      {isRegModalOpen && <RegisterEmployeeModal onClose={() => setIsRegModalOpen(false)} onSuccess={fetchEmployees} />}
      {isEditModalOpen && selectedEmp && <EditEmployeeModal employee={selectedEmp} onClose={() => setIsEditModalOpen(false)} onSuccess={fetchEmployees} />}
      {isLeaveModalOpen && selectedEmp && <EncodeLeaveModal employee={selectedEmp} onClose={() => setIsLeaveModalOpen(false)} onSuccess={fetchEmployees} />}
      {isTardyModalOpen && selectedEmp && <EquivalentDayModal employee={selectedEmp} onClose={() => setIsTardyModalOpen(false)} onSuccess={fetchEmployees} />}
    </div>
  );
};

export default Employees;

import React from 'react';
import { Send, CheckCircle2, CalendarClock } from 'lucide-react';
import { guardIssues } from './CreditGuard';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Shown instead of the Generate box once this month's credits exist, so nobody tries to generate twice.
const CreditsGeneratedNotice = ({ month, year, generatedAt }) => {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const when = generatedAt ? new Date(generatedAt) : null;
  const whenText = when && !Number.isNaN(when.getTime())
    ? when.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;
  return (
    <div className="premium-card mb-40 cg-done" role="status">
      <div className="cg-done-icon"><CheckCircle2 size={22} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="cg-done-title">{MONTHS[month - 1]} {year} monthly credits are already generated</div>
        <div className="cg-done-line">
          Every active employee received +1.25 VL and +1.25 SL{whenText ? ` on ${whenText}` : ''}. Generating again is turned off to avoid duplicate credits.
        </div>
        <div className="cg-done-next">
          <CalendarClock size={14} />
          <span>Generate Monthly Credits opens again on <strong>{MONTHS[nextMonth - 1]} 1, {nextYear}</strong>.</span>
        </div>
      </div>
    </div>
  );
};

// Employee Management: "Generate Monthly Credits (1.25)" box (month/year come from the server audit).
const MonthlyCreditsPanel = ({ accrualMonth, accrualYear, isGenerating, audit, precheck, handleGenerateCredits }) => {
  if (audit && audit.pendingAccrual === false) {
    return <CreditsGeneratedNotice month={Number(audit.month)} year={Number(audit.year)} generatedAt={audit.generatedAt} />;
  }
  const checking = !audit; // wait for the server to say whether this month is still open
  return (
  <div className="premium-card mb-40" style={{ background: 'var(--accent-light)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap' }}>
    {/* Label */}
    <div className="flex items-center gap-14" style={{ flexShrink: 0 }}>
      <Send size={20} color="var(--accent)" />
      <div className="flex flex-col" style={{ gap: '2px' }}>
        <span className="font-bold" style={{ color: 'var(--accent)', fontSize: '1rem', whiteSpace: 'nowrap' }}>Generate Monthly Credits (1.25)</span>
        {audit?.pendingRollover && (
          <span className="text-small" style={{ color: 'var(--primary)', opacity: 0.8 }}>
            Run the Yearly Rollover in Settings → Database first.
          </span>
        )}
      </div>
    </div>

    {/* Inputs + Button */}
    <div className="flex items-center gap-12" style={{ flexShrink: 0 }}>

      {/* Month Input */}
      <div className="flex flex-col" style={{ gap: '4px' }}>
        <span className="text-small font-bold" style={{ color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.7rem' }}>Month</span>
        <input
          type="number"
          className="input-field"
          style={{ width: '72px', fontWeight: 700, textAlign: 'center', border: '1.5px solid var(--accent)', color: 'var(--accent)', cursor: 'default', background: 'white' }}
          value={accrualMonth}
          readOnly
        />
      </div>

      <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '1.1rem', paddingTop: '18px' }}>/</span>

      {/* Year Input */}
      <div className="flex flex-col" style={{ gap: '4px' }}>
        <span className="text-small font-bold" style={{ color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.7rem' }}>Year</span>
        <input
          type="number"
          className="input-field"
          style={{ width: '96px', fontWeight: 700, textAlign: 'center', border: '1.5px solid var(--accent)', color: 'var(--accent)', cursor: 'default', background: 'white' }}
          value={accrualYear}
          readOnly
        />
      </div>

      <button
        className={`btn-primary${guardIssues(audit, precheck) && !isGenerating && !audit?.pendingRollover ? ' cg-attention' : ''}`}
        style={{
          height: '44px',
          padding: '0 28px',
          whiteSpace: 'nowrap',
          alignSelf: 'flex-end',
          opacity: (checking || isGenerating || audit?.pendingRollover) ? 0.5 : 1,
          cursor: (checking || isGenerating || audit?.pendingRollover) ? 'not-allowed' : 'pointer'
        }}
        onClick={handleGenerateCredits}
        disabled={checking || isGenerating || audit?.pendingRollover}
      >
        {checking ? 'Checking...' : audit?.pendingRollover ? 'Rollover Required First' : (isGenerating ? 'Generating...' : 'Confirm Generate')}
      </button>
    </div>
  </div>
  );
};

export default MonthlyCreditsPanel;

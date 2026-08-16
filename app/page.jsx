'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Fingerprint,
  Wallet,
  Lock,
  Coins,
  FileSearch,
  ScrollText,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  BadgeCheck,
  ShieldAlert,
  ExternalLink,
  Plus,
  Skull,
} from 'lucide-react';
import {
  connectWallet,
  getInjectedProvider,
  fetchStats,
  fetchCases,
  fetchCase,
  createCase,
  submitEvidence,
  cancelCase,
  formatGen,
  shortenAddress,
  CONTRACT_ADDRESS,
} from '../utils/client';

const PAGE_SIZE = 6;
const MAX_ATTEMPTS_PER_CASE = 25;

// ---------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------

function StatusStamp({ status }) {
  const map = {
    OPEN: { cls: 'status-open', label: 'Open Case' },
    UNDER_REVIEW: { cls: 'status-review', label: 'Under Review' },
    SOLVED: { cls: 'status-solved', label: 'Solved' },
    CANCELLED: { cls: 'status-cancelled', label: 'Cancelled' },
    EXPIRED: { cls: 'status-expired', label: 'Expired' },
  };
  const entry = map[status] || { cls: 'status-open', label: status };
  return <span className={`status-stamp ${entry.cls}`}>{entry.label}</span>;
}

function SectionDivider() {
  return <div className="divider-noir my-6" />;
}

// ---------------------------------------------------------------------
// Create Case modal
// ---------------------------------------------------------------------

function CreateCaseModal({ account, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [solutionCriteria, setSolutionCriteria] = useState('');
  const [bountyGen, setBountyGen] = useState('0.1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!title.trim() || !solutionCriteria.trim() || !bountyGen) {
      setError('Title, secret solution criteria, and a bounty amount are all required.');
      return;
    }

    setSubmitting(true);
    try {
      await createCase({ account, title, description, solutionCriteria, bountyGen });
      onCreated();
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to open the case. See console for details.');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/80 backdrop-blur-sm px-4 py-10">
      <div className="case-card w-full max-w-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-case text-xl glow-text flex items-center gap-2">
            <ScrollText size={20} /> Open a New Case File
          </h2>
          <button onClick={onClose} className="text-ink-dim hover:text-gold transition">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-widest text-ink-dim mb-1">
              Case Title
            </label>
            <input
              className="paper-input w-full px-3 py-2 rounded"
              placeholder="The Vanishing of Dr. Ashworth"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-ink-dim mb-1">
              Public Case Lore / Description
            </label>
            <textarea
              className="paper-input w-full px-3 py-2 rounded h-24 resize-none"
              placeholder="What Hunters will see. Set the scene, drop clues, keep the real answer out of here."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-ink-dim mb-1 flex items-center gap-1.5">
              <Lock size={12} /> Secret Solution Criteria
            </label>
            <textarea
              className="paper-input w-full px-3 py-2 rounded h-28 resize-none"
              placeholder="The exact rubric the AI adjudicator will grade submissions against. Be specific and unambiguous."
              value={solutionCriteria}
              onChange={(e) => setSolutionCriteria(e.target.value)}
              maxLength={3000}
            />
            <p className="text-[0.7rem] text-ink-dim mt-1 leading-relaxed">
              Kept out of every public view in the UI — but GenVM contract storage isn't
              encrypted, so don't put anything here you couldn't bear leaking.
            </p>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-ink-dim mb-1 flex items-center gap-1.5">
              <Coins size={12} /> Bounty (GEN)
            </label>
            <input
              type="number"
              min="0"
              step="0.0001"
              className="paper-input w-full px-3 py-2 rounded"
              value={bountyGen}
              onChange={(e) => setBountyGen(e.target.value)}
            />
          </div>

          {error && (
            <div className="text-blood text-sm border border-blood/40 bg-blood/10 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="gold-btn px-5 py-2.5 rounded flex-1 flex items-center justify-center gap-2">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <ScrollText size={16} />}
              {submitting ? 'Filing Case…' : 'Deposit Bounty & Open Case'}
            </button>
            <button type="button" onClick={onClose} className="ghost-btn px-5 py-2.5 rounded" disabled={submitting}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Case Detail modal
// ---------------------------------------------------------------------

function CaseDetailModal({ caseId, account, onClose, onChanged }) {
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [deliberating, setDeliberating] = useState(false);
  const [verdict, setVerdict] = useState(null); // { verdict, reasoning }
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCase(caseId);
      setCaseData(data);
    } catch (err) {
      setError(err?.message || 'Could not load this case.');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const isCreator =
    account && caseData && String(caseData.creator).toLowerCase() === String(account).toLowerCase();

  async function handleSubmitEvidence(e) {
    e.preventDefault();
    setError('');
    setVerdict(null);

    if (!evidenceUrl.trim()) {
      setError('Paste a source URL to your evidence (IPFS text file, GitHub gist/commit, etc).');
      return;
    }

    setDeliberating(true);
    try {
      await submitEvidence({ account, caseId, evidenceUrl });
      // Verdict resolves synchronously on-chain; re-fetch the case to read
      // the outcome rather than depending on the raw receipt shape.
      const fresh = await fetchCase(caseId);
      setCaseData(fresh);
      setVerdict({
        verdict: fresh.status === 'SOLVED' ? 'SOLVED' : 'UNSOLVED',
        reasoning: fresh.last_verdict_reasoning,
      });
      onChanged?.();
    } catch (err) {
      setError(err?.message || 'The submission failed. See console for details.');
      console.error(err);
    } finally {
      setDeliberating(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    setError('');
    try {
      await cancelCase({ account, caseId });
      await reload();
      onChanged?.();
    } catch (err) {
      setError(err?.message || 'Could not cancel this case.');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/80 backdrop-blur-sm px-4 py-10">
      <div className="case-card w-full max-w-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-case text-xl glow-text flex items-center gap-2">
            <FileSearch size={20} /> Case File #{caseId}
          </h2>
          <button onClick={onClose} className="text-ink-dim hover:text-gold transition">
            <X size={20} />
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-ink-dim py-10 justify-center">
            <Loader2 className="animate-spin" size={18} /> Pulling the file…
          </div>
        )}

        {!loading && caseData && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <StatusStamp status={caseData.status} />
              <span className="text-ink-dim text-xs">
                Filed by {shortenAddress(caseData.creator)}
              </span>
              {isCreator && <span className="text-gold text-xs">(you)</span>}
            </div>

            <h3 className="font-case text-2xl">{caseData.title}</h3>
            <p className="text-ink-dim leading-relaxed whitespace-pre-wrap">
              {caseData.description || 'No further lore was provided for this case.'}
            </p>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="case-card p-3">
                <div className="text-ink-dim text-xs uppercase tracking-widest mb-1">Bounty</div>
                <div className="glow-text font-case text-lg flex items-center gap-1.5">
                  <Coins size={16} /> {formatGen(caseData.bounty)} GEN
                </div>
              </div>
              <div className="case-card p-3">
                <div className="text-ink-dim text-xs uppercase tracking-widest mb-1">Attempts</div>
                <div className="text-lg">
                  {Number(caseData.attempts)} / {MAX_ATTEMPTS_PER_CASE}
                </div>
              </div>
            </div>

            {caseData.status === 'SOLVED' && (
              <div className="border border-gold/40 bg-gold/5 rounded p-4 flex items-start gap-3">
                <BadgeCheck className="text-gold shrink-0 mt-0.5" size={20} />
                <div>
                  <div className="font-case text-gold">Case Closed</div>
                  <p className="text-sm text-ink-dim mt-1">
                    Solved by {shortenAddress(caseData.solver)}. The bounty has been paid out.
                  </p>
                  {caseData.last_verdict_reasoning && (
                    <p className="text-sm mt-2 italic text-ink-dim">
                      AI reasoning: "{caseData.last_verdict_reasoning}"
                    </p>
                  )}
                </div>
              </div>
            )}

            {verdict && verdict.verdict === 'UNSOLVED' && (
              <div className="border border-blood/40 bg-blood/10 rounded p-4 flex items-start gap-3">
                <ShieldAlert className="text-blood shrink-0 mt-0.5" size={20} />
                <div>
                  <div className="font-case text-blood">Verdict: Unsolved</div>
                  <p className="text-sm text-ink-dim mt-1">
                    {verdict.reasoning || 'The AI adjudicator was not convinced by this evidence.'}
                  </p>
                </div>
              </div>
            )}

            {caseData.evidence_url && caseData.status !== 'CANCELLED' && (
              <div className="text-xs text-ink-dim flex items-center gap-1.5">
                Last evidence submitted:{' '}
                <a
                  href={caseData.evidence_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gold hover:underline flex items-center gap-1"
                >
                  {caseData.evidence_url} <ExternalLink size={12} />
                </a>
              </div>
            )}

            <SectionDivider />

            {caseData.status === 'OPEN' && !isCreator && (
              <form onSubmit={handleSubmitEvidence} className="space-y-3">
                <label className="block text-xs uppercase tracking-widest text-ink-dim">
                  Submit Your Deduction (evidence source URL)
                </label>
                <input
                  className="paper-input w-full px-3 py-2 rounded"
                  placeholder="https://ipfs.io/ipfs/... or a GitHub gist/commit URL"
                  value={evidenceUrl}
                  onChange={(e) => setEvidenceUrl(e.target.value)}
                  disabled={deliberating}
                />
                <button
                  type="submit"
                  disabled={deliberating}
                  className="gold-btn px-5 py-2.5 rounded w-full flex items-center justify-center gap-2"
                >
                  {deliberating ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Validators are deliberating… (this can take 30–90s)
                    </>
                  ) : (
                    <>
                      <Fingerprint size={16} /> Submit to AI Consensus
                    </>
                  )}
                </button>
              </form>
            )}

            {caseData.status === 'OPEN' && isCreator && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="ghost-btn px-5 py-2.5 rounded w-full flex items-center justify-center gap-2"
              >
                {cancelling ? <Loader2 size={16} className="animate-spin" /> : <Skull size={16} />}
                {cancelling ? 'Cancelling…' : 'Cancel Case & Reclaim Bounty'}
              </button>
            )}

            {caseData.status === 'OPEN' && isCreator && (
              <p className="text-[0.7rem] text-ink-dim text-center">
                As the creator, you can't submit evidence on your own case.
              </p>
            )}

            {error && (
              <div className="text-blood text-sm border border-blood/40 bg-blood/10 rounded px-3 py-2">
                {error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Case card (dashboard grid item)
// ---------------------------------------------------------------------

function CaseCard({ caseItem, onOpen }) {
  return (
    <button onClick={() => onOpen(caseItem.case_id)} className="case-card p-5 text-left w-full">
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="font-case text-lg leading-snug">{caseItem.title}</h3>
        <StatusStamp status={caseItem.status} />
      </div>
      <p className="text-ink-dim text-sm line-clamp-3 mb-4 min-h-[3.6rem]">
        {caseItem.description || 'No lore filed for this case yet.'}
      </p>
      <div className="flex items-center justify-between text-sm">
        <span className="glow-text flex items-center gap-1.5">
          <Coins size={14} /> {formatGen(caseItem.bounty)} GEN
        </span>
        <span className="text-ink-dim text-xs">
          {Number(caseItem.attempts)} attempt{Number(caseItem.attempts) === 1 ? '' : 's'}
        </span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------

export default function Page() {
  const [account, setAccount] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [walletError, setWalletError] = useState('');

  const [stats, setStats] = useState(null);
  const [cases, setCases] = useState([]);
  const [offset, setOffset] = useState(0);
  const [loadingCases, setLoadingCases] = useState(true);
  const [listError, setListError] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [openCaseId, setOpenCaseId] = useState(null);

  const loadCases = useCallback(async (currentOffset) => {
    setLoadingCases(true);
    setListError('');
    try {
      const data = await fetchCases(currentOffset, PAGE_SIZE);
      setCases(data || []);
    } catch (err) {
      setListError(
        err?.message ||
          'Could not reach the SherlockLayer contract. Check NEXT_PUBLIC_CONTRACT_ADDRESS.'
      );
      setCases([]);
    } finally {
      setLoadingCases(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const s = await fetchStats();
      setStats(s);
    } catch {
      // Non-fatal — the dashboard still works without the stats strip.
    }
  }, []);

  useEffect(() => {
    loadCases(offset);
  }, [offset, loadCases]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    const provider = getInjectedProvider();
    if (!provider) return;
    provider
      .request({ method: 'eth_accounts' })
      .then((accts) => {
        if (accts && accts.length > 0) setAccount(accts[0]);
      })
      .catch(() => {});

    const handleAccountsChanged = (accts) => setAccount(accts?.[0] || null);
    provider.on?.('accountsChanged', handleAccountsChanged);
    return () => provider.removeListener?.('accountsChanged', handleAccountsChanged);
  }, []);

  async function handleConnect() {
    setConnecting(true);
    setWalletError('');
    try {
      const addr = await connectWallet();
      setAccount(addr);
    } catch (err) {
      setWalletError(err?.message || 'Wallet connection failed.');
    } finally {
      setConnecting(false);
    }
  }

  function refreshAfterChange() {
    loadCases(offset);
    loadStats();
  }

  return (
    <main className="min-h-screen max-w-6xl mx-auto px-5 py-10 relative z-10">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
        <div>
          <div className="flex items-center gap-3">
            <Fingerprint className="text-gold animate-flicker" size={32} />
            <h1 className="font-case text-3xl md:text-4xl glow-text tracking-widest">
              SHERLOCKLAYER
            </h1>
          </div>
          <p className="text-ink-dim text-sm mt-1 ml-1">
            Decentralized Mystery &amp; ARG Adjudication Protocol — GenLayer AI consensus is your
            Game Master.
          </p>
        </div>

        <div className="flex flex-col items-start md:items-end gap-2">
          {account ? (
            <div className="ghost-btn px-4 py-2 rounded flex items-center gap-2 text-sm">
              <Wallet size={16} /> {shortenAddress(account)}
            </div>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="gold-btn px-5 py-2.5 rounded flex items-center gap-2"
            >
              {connecting ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
              {connecting ? 'Connecting…' : 'Connect Wallet'}
            </button>
          )}
          {walletError && <span className="text-blood text-xs max-w-xs text-right">{walletError}</span>}
          {!CONTRACT_ADDRESS && (
            <span className="text-blood text-xs max-w-xs text-right">
              NEXT_PUBLIC_CONTRACT_ADDRESS is not set.
            </span>
          )}
        </div>
      </header>

      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="case-card p-4 text-center">
            <div className="text-ink-dim text-xs uppercase tracking-widest">Total Cases</div>
            <div className="font-case text-2xl glow-text">{Number(stats.total_cases)}</div>
          </div>
          <div className="case-card p-4 text-center">
            <div className="text-ink-dim text-xs uppercase tracking-widest">Cases Solved</div>
            <div className="font-case text-2xl glow-text">{Number(stats.total_cases_solved)}</div>
          </div>
          <div className="case-card p-4 text-center">
            <div className="text-ink-dim text-xs uppercase tracking-widest">Bounty Paid</div>
            <div className="font-case text-2xl glow-text">{formatGen(stats.total_bounty_paid)} GEN</div>
          </div>
        </div>
      )}

      {/* Dashboard controls */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-case text-xl text-ink flex items-center gap-2">
          <ScrollText size={20} className="text-gold" /> Open Case Files
        </h2>
        <button
          onClick={() => (account ? setShowCreate(true) : handleConnect())}
          className="gold-btn px-4 py-2 rounded flex items-center gap-2 text-sm"
        >
          <Plus size={16} /> New Case
        </button>
      </div>

      {loadingCases && (
        <div className="flex items-center gap-2 text-ink-dim py-16 justify-center">
          <Loader2 className="animate-spin" size={18} /> Pulling case files from the archive…
        </div>
      )}

      {!loadingCases && listError && (
        <div className="text-blood text-sm border border-blood/40 bg-blood/10 rounded px-4 py-3">
          {listError}
        </div>
      )}

      {!loadingCases && !listError && cases.length === 0 && (
        <div className="text-ink-dim text-center py-16 border border-dashed border-gold-dim/40 rounded">
          No cases on file yet. Be the first Game Master — open one above.
        </div>
      )}

      {!loadingCases && cases.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {cases.map((c) => (
            <CaseCard key={String(c.case_id)} caseItem={c} onOpen={setOpenCaseId} />
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-center gap-4 mt-8">
        <button
          onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
          disabled={offset === 0 || loadingCases}
          className="ghost-btn px-3 py-2 rounded flex items-center gap-1 text-sm"
        >
          <ChevronLeft size={16} /> Prev
        </button>
        <span className="text-ink-dim text-xs uppercase tracking-widest">
          Page {Math.floor(offset / PAGE_SIZE) + 1}
        </span>
        <button
          onClick={() => setOffset((o) => o + PAGE_SIZE)}
          disabled={loadingCases || cases.length < PAGE_SIZE}
          className="ghost-btn px-3 py-2 rounded flex items-center gap-1 text-sm"
        >
          Next <ChevronRight size={16} />
        </button>
      </div>

      <footer className="text-center text-ink-dim text-xs mt-16 opacity-60">
        Powered by GenLayer Intelligent Contracts · Testnet Bradbury
      </footer>

      {/* Modals */}
      {showCreate && account && (
        <CreateCaseModal
          account={account}
          onClose={() => setShowCreate(false)}
          onCreated={refreshAfterChange}
        />
      )}
      {openCaseId !== null && (
        <CaseDetailModal
          caseId={openCaseId}
          account={account}
          onClose={() => setOpenCaseId(null)}
          onChanged={refreshAfterChange}
        />
      )}
    </main>
  );
}

import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Download, FileText, Plus, RotateCcw, Search } from 'lucide-react';
import { api, ApiError } from '../api';
import { useApp } from '../context/AppContext';
import type { ShellContext } from '../components/Shell';
import type { Transaction } from '../types';
import { EmptyState, ErrorState, formatDate, formatMoney, Loading, Modal, StatusBadge } from '../components/ui';
import { PageHeading, TransactionRow } from './DashboardPage';

export function TransactionsPage() {
  const { selectedProfileId } = useApp();
  const { openTransaction, refreshKey, refresh } = useOutletContext<ShellContext>();
  const [items, setItems] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [selected, setSelected] = useState<Transaction | null>(null);

  const load = () => {
    if (!selectedProfileId) return setLoading(false);
    setLoading(true);
    api<{ items: Transaction[] }>(`/profiles/${selectedProfileId}/transactions?search=${encodeURIComponent(search)}${type ? `&type=${type}` : ''}`)
      .then((result) => setItems(result.items))
      .catch((caught) => setError(caught.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [selectedProfileId, refreshKey, type, search]);

  if (!selectedProfileId) return <div className="page"><EmptyState title="Choose a profile" message="Transactions belong to one financial profile. Select one from the header."/></div>;

  const exportCsv = () => {
    const rows = [
      ['Date', 'Type', 'Description', 'Account', 'Category', 'Status', 'Amount'],
      ...items.map((item) => [item.transactionDate.slice(0, 10), item.type, item.description || item.counterparty || '', item.toAccount?.name || item.fromAccount?.name || '', item.category?.name || '', item.status, item.amount]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'transactions.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const reverse = async () => {
    if (!selected || !confirm('Reverse this posted transaction? A balancing reversal will preserve its audit history.')) return;
    try {
      await api(`/profiles/${selectedProfileId}/transactions/${selected.id}/reverse`, { method: 'POST' });
      setSelected(null);
      refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not reverse this transaction.');
    }
  };

  return <div className="page">
    <PageHeading eyebrow="Money movement" title="Transactions" subtitle="Every posted item is backed by a balanced ledger entry." actions={<button className="button primary" onClick={() => openTransaction()}><Plus/> New transaction</button>}/>
    <div className="filter-bar">
      <form onSubmit={(event) => { event.preventDefault(); load(); }} className="search-box"><Search/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search description or person"/></form>
      <select value={type} onChange={(event) => setType(event.target.value)}><option value="">All types</option><option value="MONEY_IN">Money In</option><option value="MONEY_OUT">Money Out</option><option value="TRANSFER">Transfers</option></select>
      <button className="button ghost" onClick={exportCsv} disabled={!items.length}><Download/> Export CSV</button>
    </div>
    <div className="tabs"><button className={!type ? 'active' : ''} onClick={() => setType('')}>All</button><button className={type === 'MONEY_IN' ? 'active' : ''} onClick={() => setType('MONEY_IN')}>Money In</button><button className={type === 'MONEY_OUT' ? 'active' : ''} onClick={() => setType('MONEY_OUT')}>Money Out</button><button className={type === 'TRANSFER' ? 'active' : ''} onClick={() => setType('TRANSFER')}>Transfers</button></div>
    {loading ? <Loading label="Loading transactions"/> : error ? <ErrorState message={error} retry={load}/> : items.length ? <section className="card transaction-workspace"><div className="list-labels"><span>Transaction</span><span>Status</span><span>Amount</span></div>{items.map((item) => <TransactionRow key={item.id} transaction={item} onClick={() => setSelected(item)}/>)}</section> : <EmptyState icon={<FileText/>} title="No transactions found" message="Record money in, money out, or a transfer to begin." action={<button className="button primary" onClick={() => openTransaction()}><Plus/> Add transaction</button>}/>}
    {selected && <Modal title="Transaction details" description="Posted financial record" onClose={() => setSelected(null)}>
      <div className="detail-amount"><span>{selected.type.replaceAll('_', ' ')}</span><strong>{formatMoney(selected.amount)}</strong><StatusBadge status={selected.status}/></div>
      <dl className="detail-list"><div><dt>Date</dt><dd>{formatDate(selected.transactionDate)}</dd></div><div><dt>Account</dt><dd>{selected.toAccount?.name || selected.fromAccount?.name}</dd></div>{selected.category && <div><dt>Category</dt><dd>{selected.category.name}</dd></div>}{selected.counterparty && <div><dt>Person or organisation</dt><dd>{selected.counterparty}</dd></div>}{selected.description && <div><dt>Description</dt><dd>{selected.description}</dd></div>}<div><dt>Ledger status</dt><dd>Balanced and posted</dd></div><div><dt>Attachments</dt><dd>{selected.attachments.length || 'None'}</dd></div></dl>
      <div className="integrity-note"><FileText/><div><strong>This record is protected</strong><p>Posted transactions cannot be deleted. Reverse it to correct the balance while retaining its history.</p></div></div>
      <footer className="modal-actions"><button className="button secondary" onClick={() => setSelected(null)}>Close</button>{selected.status === 'POSTED' && <button className="button danger" onClick={reverse}><RotateCcw/> Reverse transaction</button>}</footer>
    </Modal>}
  </div>;
}

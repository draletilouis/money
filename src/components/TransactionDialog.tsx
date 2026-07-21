import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Paperclip } from 'lucide-react';
import { api, ApiError } from '../api';
import { useApp } from '../context/AppContext';
import type { Account, Category } from '../types';
import { Modal } from './ui';

type Kind = 'MONEY_IN' | 'MONEY_OUT' | 'TRANSFER';

export function TransactionDialog({ initialType = 'MONEY_OUT', onClose, onCreated }: { initialType?: Kind; onClose: () => void; onCreated: () => void }) {
  const { selectedProfileId } = useApp();
  const [type, setType] = useState<Kind>(initialType); const [accounts, setAccounts] = useState<Account[]>([]); const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  useEffect(() => { if (selectedProfileId) Promise.all([api<Account[]>(`/profiles/${selectedProfileId}/accounts`), api<Category[]>(`/profiles/${selectedProfileId}/categories`)]).then(([a, c]) => { setAccounts(a); setCategories(c); }); }, [selectedProfileId]);
  const allowedCategories = useMemo(() => categories.filter((item) => item.type === (type === 'MONEY_IN' ? 'INCOME' : 'EXPENSE')), [categories, type]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selectedProfileId) return; setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    const payload = { type, amount: Number(data.get('amount')), feeAmount: type === 'TRANSFER' ? Number(data.get('feeAmount') || 0) : 0, fromAccountId: type !== 'MONEY_IN' ? data.get('fromAccountId') || undefined : undefined, toAccountId: type !== 'MONEY_OUT' ? data.get('toAccountId') || undefined : undefined, categoryId: type !== 'TRANSFER' ? data.get('categoryId') || undefined : undefined, transactionDate: data.get('transactionDate'), counterparty: data.get('counterparty') || undefined, description: data.get('description') || undefined, reference: data.get('reference') || undefined, idempotencyKey: crypto.randomUUID() };
    try {
      const transaction = await api<{ id: string }>(`/profiles/${selectedProfileId}/transactions`, { method: 'POST', body: JSON.stringify(payload) });
      if (files?.length) { const upload = new FormData(); [...files].forEach((file) => upload.append('files', file)); await api(`/profiles/${selectedProfileId}/transactions/${transaction.id}/attachments`, { method: 'POST', body: upload }); }
      onCreated(); onClose();
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'The transaction could not be posted.'); } finally { setBusy(false); }
  };

  return <Modal title={type === 'MONEY_IN' ? 'Add Money In' : type === 'MONEY_OUT' ? 'Add Money Out' : 'Transfer money'} description="Only the essentials are required. You can add context below." onClose={onClose}>
    <form onSubmit={submit} className="form-stack">
      <div className="segmented" aria-label="Transaction type">
        <button type="button" className={type === 'MONEY_IN' ? 'active' : ''} onClick={() => setType('MONEY_IN')}><ArrowDownLeft size={17}/> Money In</button>
        <button type="button" className={type === 'MONEY_OUT' ? 'active' : ''} onClick={() => setType('MONEY_OUT')}><ArrowUpRight size={17}/> Money Out</button>
        <button type="button" className={type === 'TRANSFER' ? 'active' : ''} onClick={() => setType('TRANSFER')}><ArrowRightLeft size={17}/> Transfer</button>
      </div>
      {error && <div className="form-error">{error}</div>}
      <label className="money-field"><span>Amount</span><div><b>UGX</b><input name="amount" type="number" min="1" step="1" placeholder="0" required autoFocus/></div></label>
      <div className="form-grid">
        {type !== 'MONEY_IN' && <label><span>From account</span><select name="fromAccountId" required defaultValue=""><option value="" disabled>Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>}
        {type !== 'MONEY_OUT' && <label><span>To account</span><select name="toAccountId" required defaultValue=""><option value="" disabled>Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>}
        {type !== 'TRANSFER' && <label><span>Category</span><select name="categoryId" required defaultValue=""><option value="" disabled>Select category</option>{allowedCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>}
        <label><span>Date</span><input name="transactionDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)}/></label>
        {type === 'TRANSFER' && <label><span>Transfer fee</span><input name="feeAmount" type="number" min="0" step="1" defaultValue="0"/></label>}
      </div>
      <details><summary>More details</summary><div className="form-grid details-grid"><label><span>{type === 'MONEY_IN' ? 'Source' : 'Payee'}</span><input name="counterparty" placeholder="Person or organisation"/></label><label><span>Reference</span><input name="reference" placeholder="Optional reference"/></label><label className="full"><span>Description</span><textarea name="description" rows={3} placeholder="Add a helpful note"/></label><label className="attachment-field full"><Paperclip size={18}/><span>Attach receipt or document</span><input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf,.docx,.xlsx" onChange={(event) => setFiles(event.target.files)}/></label></div></details>
      <footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Posting…' : 'Post transaction'}</button></footer>
    </form>
  </Modal>;
}

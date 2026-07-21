import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Archive, CalendarClock, CircleAlert, Edit3, Flag, List, Plus, ReceiptText, TrendingDown, TrendingUp, WalletCards } from 'lucide-react';
import { api, ApiError } from '../api';
import { useApp } from '../context/AppContext';
import type { Account, Category } from '../types';
import { EmptyState, ErrorState, formatDate, formatMoney, Loading, Modal, StatusBadge } from '../components/ui';
import { PageHeading } from './DashboardPage';
import type { ShellContext } from '../components/Shell';

type Budget = { id: string; name: string; amount: string; spent: string; percentUsed: number; thresholdReached: boolean; alertThreshold: number; startDate: string; endDate: string; category: Category };
type Bill = { id: string; payee: string; amount: string; dueDate: string; status: string; category: Category; paymentAccountId?: string };
type ExpectedIncome = { id: string; source: string; amount: string; expectedDate: string; status: string; category: Category; destinationAccountId?: string };
type Goal = { id: string; name: string; goalType: string; targetAmount: string; currentAmount: string; targetDate?: string; status: string; linkedAccountId?: string };
type Forecast = { asOf: string; currentAvailable: string; horizons: { days: number; through: string; bills: string; expectedIncome: string; projectedAvailable: string }[] };
type Planning = { budgets: Budget[]; bills: Bill[]; expectedIncome: ExpectedIncome[]; goals: Goal[]; forecast: Forecast };
type Tab = 'budgets' | 'bills' | 'income' | 'goals' | 'forecast';
type FormKind = Exclude<Tab, 'forecast'>;
type Settlement = { kind: 'bill'; item: Bill } | { kind: 'income'; item: ExpectedIncome };
type BudgetMovement = { id: string; amount: string; transactionDate: string; counterparty?: string; description?: string; fromAccount?: Account };
type BudgetMovements = { budget: Budget; spent: string; remaining: string; movements: BudgetMovement[] };

const today = () => new Date().toISOString().slice(0, 10);
const monthEnd = () => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10); };
const messageFrom = (caught: unknown, fallback: string) => caught instanceof ApiError ? caught.message : fallback;

export function PlanningPage() {
  const { selectedProfileId } = useApp();
  const { refreshKey } = useOutletContext<ShellContext>();
  const [data, setData] = useState<Planning | null>(null); const [tab, setTab] = useState<Tab>('budgets');
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [version, setVersion] = useState(0);
  const [form, setForm] = useState<FormKind | null>(null); const [settlement, setSettlement] = useState<Settlement | null>(null); const [progressGoal, setProgressGoal] = useState<Goal | null>(null);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null); const [movementBudget, setMovementBudget] = useState<Budget | null>(null);
  const [categories, setCategories] = useState<Category[]>([]); const [accounts, setAccounts] = useState<Account[]>([]);

  const reload = () => setVersion((value) => value + 1);
  useEffect(() => {
    if (!selectedProfileId) { setLoading(false); return; }
    setLoading(true); setError('');
    Promise.all([
      api<Planning>(`/profiles/${selectedProfileId}/planning`),
      api<Category[]>(`/profiles/${selectedProfileId}/categories`),
      api<Account[]>(`/profiles/${selectedProfileId}/accounts`),
    ]).then(([planning, availableCategories, availableAccounts]) => { setData(planning); setCategories(availableCategories); setAccounts(availableAccounts); }).catch((caught) => setError(caught.message)).finally(() => setLoading(false));
  }, [selectedProfileId, version, refreshKey]);

  if (!selectedProfileId) return <div className="page"><EmptyState title="Choose a profile" message="Plans are kept within a specific financial profile."/></div>;
  const createLabel: Record<FormKind, string> = { budgets: 'Create budget', bills: 'Add bill', income: 'Add expected income', goals: 'Create goal' };
  const action = tab !== 'forecast' ? <button className="button primary" onClick={() => setForm(tab)}><Plus/> {createLabel[tab]}</button> : undefined;
  const cancelItem = async (kind: 'bills' | 'expected-income', id: string) => {
    if (!window.confirm('Cancel this planning item? It will remain in your history.')) return;
    try { await api(`/profiles/${selectedProfileId}/${kind}/${id}/cancel`, { method: 'POST' }); reload(); } catch (caught) { setError(messageFrom(caught, 'Could not cancel this item.')); }
  };
  const archiveBudget = async (budget: Budget) => {
    if (!window.confirm(`Archive “${budget.name}”? Its history will be preserved.`)) return;
    try { await api(`/profiles/${selectedProfileId}/budgets/${budget.id}/archive`, { method: 'POST' }); reload(); } catch (caught) { setError(messageFrom(caught, 'Could not archive this budget.')); }
  };

  return <div className="page">
    <PageHeading eyebrow="Look ahead with confidence" title="Planning" subtitle="Budgets and upcoming commitments turn today’s balance into a useful forecast." actions={action}/>
    <div className="tabs planning-tabs">
      <TabButton active={tab === 'budgets'} onClick={() => setTab('budgets')}>Budgets</TabButton><TabButton active={tab === 'bills'} onClick={() => setTab('bills')}>Bills</TabButton><TabButton active={tab === 'income'} onClick={() => setTab('income')}>Expected income</TabButton><TabButton active={tab === 'goals'} onClick={() => setTab('goals')}>Goals</TabButton><TabButton active={tab === 'forecast'} onClick={() => setTab('forecast')}>Forecast</TabButton>
    </div>
    {loading ? <Loading label="Loading your plan"/> : error ? <ErrorState message={error} retry={reload}/> : data && <>
      {tab === 'budgets' && <Budgets budgets={data.budgets} onCreate={() => setForm('budgets')} onEdit={setEditingBudget} onArchive={archiveBudget} onMovements={setMovementBudget}/>}
      {tab === 'bills' && <PlanningList empty="No bills have been added." emptyAction={<button className="button primary" onClick={() => setForm('bills')}><Plus/> Add bill</button>} items={data.bills.map((bill) => ({ id: bill.id, icon: <CalendarClock/>, title: bill.payee, subtitle: `${bill.category.name} · Due ${formatDate(bill.dueDate)}`, amount: formatMoney(bill.amount), status: bill.status, actions: !['PAID', 'CANCELLED'].includes(bill.status) && <><button className="button primary tiny" onClick={() => setSettlement({ kind: 'bill', item: bill })}>Mark paid</button><button className="text-button" onClick={() => cancelItem('bills', bill.id)}>Cancel</button></> }))}/>}
      {tab === 'income' && <PlanningList empty="No expected income has been added." emptyAction={<button className="button primary" onClick={() => setForm('income')}><Plus/> Add expected income</button>} items={data.expectedIncome.map((item) => ({ id: item.id, icon: <TrendingUp/>, title: item.source, subtitle: `${item.category.name} · Expected ${formatDate(item.expectedDate)}`, amount: formatMoney(item.amount), status: item.status, actions: !['RECEIVED', 'CANCELLED'].includes(item.status) && <><button className="button primary tiny" onClick={() => setSettlement({ kind: 'income', item })}>Mark received</button><button className="text-button" onClick={() => cancelItem('expected-income', item.id)}>Cancel</button></> }))}/>}
      {tab === 'goals' && <PlanningList empty="No goals have been created." emptyAction={<button className="button primary" onClick={() => setForm('goals')}><Plus/> Create goal</button>} items={data.goals.map((item) => ({ id: item.id, icon: <Flag/>, title: item.name, subtitle: `${formatMoney(item.currentAmount)} of ${formatMoney(item.targetAmount)}${item.targetDate ? ` · Target ${formatDate(item.targetDate)}` : ''}`, amount: `${Math.min(100, Math.round(Number(item.currentAmount) / Number(item.targetAmount) * 100))}%`, status: item.status, actions: <button className="button secondary tiny" onClick={() => setProgressGoal(item)}>Update</button> }))}/>}
      {tab === 'forecast' && <ForecastPanel forecast={data.forecast}/>}
    </>}
    {form === 'budgets' && <BudgetForm profileId={selectedProfileId} categories={categories} onClose={() => setForm(null)} onCreated={() => { setForm(null); reload(); }}/>}
    {editingBudget && <BudgetForm profileId={selectedProfileId} categories={categories} budget={editingBudget} onClose={() => setEditingBudget(null)} onCreated={() => { setEditingBudget(null); reload(); }}/>}
    {movementBudget && <BudgetMovementsModal profileId={selectedProfileId} budget={movementBudget} onClose={() => setMovementBudget(null)}/>}
    {form === 'bills' && <BillForm profileId={selectedProfileId} categories={categories} accounts={accounts} onClose={() => setForm(null)} onCreated={() => { setForm(null); reload(); }}/>}
    {form === 'income' && <IncomeForm profileId={selectedProfileId} categories={categories} accounts={accounts} onClose={() => setForm(null)} onCreated={() => { setForm(null); reload(); }}/>}
    {form === 'goals' && <GoalForm profileId={selectedProfileId} accounts={accounts} onClose={() => setForm(null)} onCreated={() => { setForm(null); reload(); }}/>}
    {settlement && <SettlementForm profileId={selectedProfileId} settlement={settlement} accounts={accounts} onClose={() => setSettlement(null)} onCompleted={() => { setSettlement(null); reload(); }}/>}
    {progressGoal && <GoalProgressForm profileId={selectedProfileId} goal={progressGoal} onClose={() => setProgressGoal(null)} onCompleted={() => { setProgressGoal(null); reload(); }}/>}
  </div>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) { return <button className={active ? 'active' : ''} onClick={onClick}>{children}</button>; }

function Budgets({ budgets, onCreate, onEdit, onArchive, onMovements }: { budgets: Budget[]; onCreate: () => void; onEdit: (budget: Budget) => void; onArchive: (budget: Budget) => void; onMovements: (budget: Budget) => void }) {
  return budgets.length ? <div className="budget-grid">{budgets.map((budget) => {
    const displayPercent = Math.max(0, budget.percentUsed); const barPercent = Math.min(100, displayPercent); const overBudget = displayPercent >= 100;
    return <article className={`card budget-card ${budget.thresholdReached ? 'budget-warning' : ''}`} key={budget.id}>
      <div><span className="category-dot"/><div><strong>{budget.name}</strong><small>{budget.category.name} · {formatDate(budget.startDate)} – {formatDate(budget.endDate)}</small></div><b>{displayPercent}%</b></div>
      <div className={`progress ${budget.thresholdReached ? 'warning' : ''}`}><i style={{ width: `${barPercent}%` }}/></div>
      <footer><span>{formatMoney(budget.spent)} spent</span><strong>{formatMoney(Number(budget.amount) - Number(budget.spent))} left</strong></footer>
      {budget.thresholdReached && <div className="budget-alert"><CircleAlert size={15}/>{overBudget ? 'Budget limit reached' : `${budget.alertThreshold}% warning threshold reached`}</div>}
      <div className="budget-actions"><button className="text-button" onClick={() => onMovements(budget)}><List size={14}/> Movements</button><button className="text-button" onClick={() => onEdit(budget)}><Edit3 size={14}/> Edit</button><button className="text-button danger" onClick={() => onArchive(budget)}><Archive size={14}/> Archive</button></div>
    </article>;
  })}</div> : <EmptyState icon={<ReceiptText/>} title="No budget has been created" message="Create a budget to track spending from posted transactions." action={<button className="button primary" onClick={onCreate}><Plus/> Create budget</button>}/>;
}

function PlanningList({ items, empty, emptyAction }: { items: { id: string; icon: ReactNode; title: string; subtitle: string; amount: string; status: string; actions?: ReactNode }[]; empty: string; emptyAction: ReactNode }) {
  return items.length ? <section className="card planning-list">{items.map((item) => <div key={item.id}><span className="activity-icon neutral">{item.icon}</span><div><strong>{item.title}</strong><small>{item.subtitle}</small></div><StatusBadge status={item.status}/><div className="planning-value"><b>{item.amount}</b>{item.actions && <span>{item.actions}</span>}</div></div>)}</section> : <EmptyState title={empty} message="Use planning to see what is coming before it affects cash." action={emptyAction}/>;
}

function ForecastPanel({ forecast }: { forecast: Forecast }) {
  return <><section className="card forecast-summary"><div><WalletCards/><span>Available now</span><strong>{formatMoney(forecast.currentAvailable)}</strong></div><p>Projection as of {formatDate(forecast.asOf)}. It combines available account balances with open bills and expected income.</p></section><div className="forecast-grid">{forecast.horizons.map((item) => <article className="card forecast-card" key={item.days}><div><span>Next {item.days} days</span><small>Through {formatDate(item.through)}</small></div><strong className={Number(item.projectedAvailable) < 0 ? 'negative' : ''}>{formatMoney(item.projectedAvailable)}</strong><span>Projected available</span><footer><div><TrendingUp/><span>Expected income<b>{formatMoney(item.expectedIncome)}</b></span></div><div><TrendingDown/><span>Open bills<b>{formatMoney(item.bills)}</b></span></div></footer></article>)}</div></>;
}

type FormProps = { profileId: string; onClose: () => void; onCreated: () => void };
function BudgetForm({ profileId, categories, budget, onClose, onCreated }: FormProps & { categories: Category[]; budget?: Budget }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const expenses = categories.filter((item) => item.type === 'EXPENSE');
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget); try { await api(`/profiles/${profileId}/budgets${budget ? `/${budget.id}` : ''}`, { method: budget ? 'PUT' : 'POST', body: JSON.stringify({ name: data.get('name'), categoryId: data.get('categoryId'), amount: Number(data.get('amount')), startDate: data.get('startDate'), endDate: data.get('endDate'), alertThreshold: Number(data.get('alertThreshold')) }) }); onCreated(); } catch (caught) { setError(messageFrom(caught, `Could not ${budget ? 'update' : 'create'} this budget.`)); } finally { setBusy(false); } };
  return <Modal title={budget ? 'Edit budget' : 'Create a budget'} description="Spending is recalculated from posted Money Out transactions for the selected category and dates." onClose={onClose}><form className="form-stack" onSubmit={submit}>{error && <div className="form-error">{error}</div>}<label><span>Budget name</span><input name="name" placeholder="e.g. Fuel budget" defaultValue={budget?.name} required autoFocus/></label><div className="form-grid"><SelectField label="Expense category" name="categoryId" options={expenses.map((item) => [item.id, item.name])} defaultValue={budget?.category.id}/><MoneyField label="Amount" name="amount" defaultValue={budget?.amount}/><DateField label="Starts" name="startDate" value={budget?.startDate.slice(0, 10) ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)}/><DateField label="Ends" name="endDate" value={budget?.endDate.slice(0, 10) ?? monthEnd()}/><label><span>Warn me at</span><select name="alertThreshold" defaultValue={String(budget?.alertThreshold ?? 80)}><option value="70">70%</option><option value="80">80%</option><option value="90">90%</option><option value="100">100%</option></select></label></div><FormActions busy={busy} submit={budget ? 'Save changes' : 'Create budget'} onClose={onClose}/></form></Modal>;
}

function BudgetMovementsModal({ profileId, budget, onClose }: { profileId: string; budget: Budget; onClose: () => void }) {
  const [data, setData] = useState<BudgetMovements | null>(null); const [error, setError] = useState('');
  useEffect(() => { api<BudgetMovements>(`/profiles/${profileId}/budgets/${budget.id}/movements`).then(setData).catch((caught) => setError(caught.message)); }, [profileId, budget.id]);
  return <Modal title={`${budget.name} movements`} description={`${budget.category.name} · ${formatDate(budget.startDate)} – ${formatDate(budget.endDate)}`} onClose={onClose} wide>{error ? <ErrorState message={error}/> : !data ? <Loading label="Loading budget movements"/> : <div className="budget-movements"><div className="budget-movement-summary"><span>Budget<strong>{formatMoney(data.budget.amount)}</strong></span><span>Spent<strong>{formatMoney(data.spent)}</strong></span><span>Remaining<strong>{formatMoney(data.remaining)}</strong></span></div>{data.movements.length ? <div className="budget-movement-list">{data.movements.map((item) => <div key={item.id}><span className="activity-icon neutral"><TrendingDown/></span><div><strong>{item.counterparty || item.description || 'Money Out'}</strong><small>{item.fromAccount?.name || 'Account'} · {formatDate(item.transactionDate)}</small></div><b>{formatMoney(item.amount)}</b></div>)}</div> : <EmptyState title="No matching expenses" message="Posted Money Out transactions using this category and date range will appear here."/>}</div>}</Modal>;
}

function BillForm({ profileId, categories, accounts, onClose, onCreated }: FormProps & { categories: Category[]; accounts: Account[] }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const expenses = categories.filter((item) => item.type === 'EXPENSE');
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget); try { await api(`/profiles/${profileId}/bills`, { method: 'POST', body: JSON.stringify({ payee: data.get('payee'), amount: Number(data.get('amount')), dueDate: data.get('dueDate'), categoryId: data.get('categoryId'), paymentAccountId: data.get('paymentAccountId') || undefined, notes: data.get('notes') || undefined }) }); onCreated(); } catch (caught) { setError(messageFrom(caught, 'Could not add this bill.')); } finally { setBusy(false); } };
  return <Modal title="Add a bill" description="Track an upcoming payment and post it to the ledger when paid." onClose={onClose}><form className="form-stack" onSubmit={submit}>{error && <div className="form-error">{error}</div>}<label><span>Payee</span><input name="payee" placeholder="e.g. UMEME" required autoFocus/></label><div className="form-grid"><MoneyField label="Amount" name="amount"/><DateField label="Due date" name="dueDate" value={today()}/><SelectField label="Expense category" name="categoryId" options={expenses.map((item) => [item.id, item.name])}/><SelectField label="Preferred payment account" name="paymentAccountId" options={accounts.map((item) => [item.id, item.name])} optional/></div><label><span>Notes</span><textarea name="notes" rows={3}/></label><FormActions busy={busy} submit="Add bill" onClose={onClose}/></form></Modal>;
}

function IncomeForm({ profileId, categories, accounts, onClose, onCreated }: FormProps & { categories: Category[]; accounts: Account[] }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const income = categories.filter((item) => item.type === 'INCOME');
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget); try { await api(`/profiles/${profileId}/expected-income`, { method: 'POST', body: JSON.stringify({ source: data.get('source'), amount: Number(data.get('amount')), expectedDate: data.get('expectedDate'), categoryId: data.get('categoryId'), destinationAccountId: data.get('destinationAccountId') || undefined, notes: data.get('notes') || undefined }) }); onCreated(); } catch (caught) { setError(messageFrom(caught, 'Could not add this expected income.')); } finally { setBusy(false); } };
  return <Modal title="Add expected income" description="Plan for money you expect, then post it when it arrives." onClose={onClose}><form className="form-stack" onSubmit={submit}>{error && <div className="form-error">{error}</div>}<label><span>Source</span><input name="source" placeholder="e.g. Client payment" required autoFocus/></label><div className="form-grid"><MoneyField label="Amount" name="amount"/><DateField label="Expected date" name="expectedDate" value={today()}/><SelectField label="Income category" name="categoryId" options={income.map((item) => [item.id, item.name])}/><SelectField label="Expected deposit account" name="destinationAccountId" options={accounts.map((item) => [item.id, item.name])} optional/></div><label><span>Notes</span><textarea name="notes" rows={3}/></label><FormActions busy={busy} submit="Add expected income" onClose={onClose}/></form></Modal>;
}

function GoalForm({ profileId, accounts, onClose, onCreated }: FormProps & { accounts: Account[] }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget); try { await api(`/profiles/${profileId}/goals`, { method: 'POST', body: JSON.stringify({ name: data.get('name'), goalType: data.get('goalType'), targetAmount: Number(data.get('targetAmount')), currentAmount: Number(data.get('currentAmount')), targetDate: data.get('targetDate') || undefined, linkedAccountId: data.get('linkedAccountId') || undefined, description: data.get('description') || undefined }) }); onCreated(); } catch (caught) { setError(messageFrom(caught, 'Could not create this goal.')); } finally { setBusy(false); } };
  return <Modal title="Create a goal" description="Set a target and update its progress as you save." onClose={onClose}><form className="form-stack" onSubmit={submit}>{error && <div className="form-error">{error}</div>}<label><span>Goal name</span><input name="name" placeholder="e.g. Emergency fund" required autoFocus/></label><div className="form-grid"><SelectField label="Goal type" name="goalType" options={[["SAVINGS", "Savings"], ["EMERGENCY_FUND", "Emergency fund"], ["PURCHASE", "Purchase"], ["DEBT_REPAYMENT", "Debt repayment"], ["INVESTMENT", "Investment"], ["OTHER", "Other"]]}/><MoneyField label="Target amount" name="targetAmount"/><MoneyField label="Already saved" name="currentAmount" allowZero/><DateField label="Target date" name="targetDate" optional/><SelectField label="Linked account" name="linkedAccountId" options={accounts.map((item) => [item.id, item.name])} optional/></div><label><span>Description</span><textarea name="description" rows={3}/></label><FormActions busy={busy} submit="Create goal" onClose={onClose}/></form></Modal>;
}

function SettlementForm({ profileId, settlement, accounts, onClose, onCompleted }: { profileId: string; settlement: Settlement; accounts: Account[]; onClose: () => void; onCompleted: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const item = settlement.item; const bill = settlement.kind === 'bill'; const preferred = bill ? (item as Bill).paymentAccountId : (item as ExpectedIncome).destinationAccountId;
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget); const endpoint = bill ? `bills/${item.id}/pay` : `expected-income/${item.id}/receive`; try { await api(`/profiles/${profileId}/${endpoint}`, { method: 'POST', body: JSON.stringify({ accountId: data.get('accountId'), transactionDate: data.get('transactionDate') }) }); onCompleted(); } catch (caught) { setError(messageFrom(caught, `Could not mark this item ${bill ? 'paid' : 'received'}.`)); } finally { setBusy(false); } };
  return <Modal title={bill ? 'Mark bill as paid' : 'Mark income as received'} description="This action posts a real transaction to the ledger and cannot be silently deleted." onClose={onClose}><form className="form-stack" onSubmit={submit}>{error && <div className="form-error">{error}</div>}<div className="settlement-summary"><strong>{bill ? (item as Bill).payee : (item as ExpectedIncome).source}</strong><span>{formatMoney(item.amount)}</span></div>{accounts.length ? <><SelectField label={bill ? 'Paid from' : 'Deposited into'} name="accountId" options={accounts.map((account) => [account.id, `${account.name} · ${formatMoney(account.balance)}`])} defaultValue={preferred}/><DateField label={bill ? 'Payment date' : 'Received date'} name="transactionDate" value={today()}/></> : <div className="form-error">Create a financial account before settling this item.</div>}<FormActions busy={busy || !accounts.length} submit={bill ? 'Post payment' : 'Post income'} onClose={onClose}/></form></Modal>;
}

function GoalProgressForm({ profileId, goal, onClose, onCompleted }: { profileId: string; goal: Goal; onClose: () => void; onCompleted: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget); try { await api(`/profiles/${profileId}/goals/${goal.id}/progress`, { method: 'PATCH', body: JSON.stringify({ currentAmount: Number(data.get('currentAmount')) }) }); onCompleted(); } catch (caught) { setError(messageFrom(caught, 'Could not update this goal.')); } finally { setBusy(false); } };
  return <Modal title="Update goal progress" description={`Target: ${formatMoney(goal.targetAmount)}`} onClose={onClose}><form className="form-stack" onSubmit={submit}>{error && <div className="form-error">{error}</div>}<MoneyField label="Current saved amount" name="currentAmount" allowZero defaultValue={goal.currentAmount}/><FormActions busy={busy} submit="Save progress" onClose={onClose}/></form></Modal>;
}

function SelectField({ label, name, options, optional = false, defaultValue }: { label: string; name: string; options: string[][]; optional?: boolean; defaultValue?: string }) { return <label><span>{label}</span><select name={name} required={!optional} defaultValue={defaultValue ?? ''}><option value="" disabled={!optional}>{optional ? 'Not selected' : 'Select one'}</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>; }
function MoneyField({ label, name, allowZero = false, defaultValue }: { label: string; name: string; allowZero?: boolean; defaultValue?: string }) { return <label><span>{label}</span><input name={name} type="number" min={allowZero ? '0' : '1'} step="any" defaultValue={defaultValue ?? (allowZero ? '0' : undefined)} required/></label>; }
function DateField({ label, name, value, optional = false }: { label: string; name: string; value?: string; optional?: boolean }) { return <label><span>{label}</span><input name={name} type="date" defaultValue={value} required={!optional}/></label>; }
function FormActions({ busy, submit, onClose }: { busy: boolean; submit: string; onClose: () => void }) { return <footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : submit}</button></footer>; }

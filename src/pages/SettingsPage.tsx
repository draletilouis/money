import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Archive, ChevronRight, Edit3, Plus, RotateCcw, ShieldCheck, Tags, UserRound } from 'lucide-react';
import { api, ApiError } from '../api';
import { useApp } from '../context/AppContext';
import type { Category } from '../types';
import { EmptyState, ErrorState, Loading, Modal } from '../components/ui';
import { PageHeading } from './DashboardPage';

const messageFrom = (caught: unknown, fallback: string) => caught instanceof ApiError ? caught.message : fallback;

export function SettingsPage() {
  const { profiles, selectedProfile, selectedProfileId, refreshProfiles, selectProfile } = useApp();
  const [showProfileForm, setShowProfileForm] = useState(false); const [categoryForm, setCategoryForm] = useState<false | true | Category>(false);
  const [categories, setCategories] = useState<Category[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState('');

  const loadCategories = useCallback(async () => {
    if (!selectedProfileId) { setCategories([]); return; }
    setLoading(true); setError('');
    try { setCategories(await api<Category[]>(`/profiles/${selectedProfileId}/categories?includeArchived=true`)); }
    catch (caught) { setError(messageFrom(caught, 'Could not load categories.')); }
    finally { setLoading(false); }
  }, [selectedProfileId]);
  useEffect(() => { void loadCategories(); }, [loadCategories]);

  const changeCategoryStatus = async (category: Category) => {
    if (!selectedProfileId) return;
    if (category.active && !window.confirm(`Archive “${category.name}”? Existing history will be preserved.`)) return;
    setError('');
    try { await api(`/profiles/${selectedProfileId}/categories/${category.id}/${category.active ? 'archive' : 'restore'}`, { method: 'POST' }); await loadCategories(); }
    catch (caught) { setError(messageFrom(caught, `Could not ${category.active ? 'archive' : 'restore'} this category.`)); }
  };

  return <div className="page">
    <PageHeading eyebrow="Make it yours" title="Settings" subtitle="Manage profiles and define the categories used by your transactions and plans."/>
    <div className="settings-layout">
      <section>
        <div className="section-heading"><div><p className="eyebrow">Financial entities</p><h2>Profiles</h2></div><button className="button primary small" onClick={() => setShowProfileForm(true)}><Plus/> Create profile</button></div>
        <div className="settings-profiles">{profiles.map((profile) => <article key={profile.id} className={profile.id === selectedProfileId ? 'selected' : ''}><span className="profile-icon">{profile.name.charAt(0)}</span><div><strong>{profile.name}</strong><small>{profile.type.toLowerCase()} · {profile.baseCurrencyCode}</small></div><span className="status status-active">{profile.id === selectedProfileId ? 'selected' : 'active'}</span><button className="icon-button" aria-label={`Select ${profile.name}`} onClick={() => selectProfile(profile.id)}><ChevronRight/></button></article>)}</div>
      </section>
      <section>
        <div className="section-heading"><div><p className="eyebrow">Your terminology</p><h2>{selectedProfile ? `${selectedProfile.name} categories` : 'Categories'}</h2></div>{selectedProfileId && <button className="button primary small" onClick={() => setCategoryForm(true)}><Plus/> New category</button>}</div>
        {error && <ErrorState message={error} retry={loadCategories}/>}
        {!selectedProfileId ? <EmptyState icon={<Tags/>} title="Choose a profile" message="Categories belong to one financial profile."/> : loading ? <Loading label="Loading categories"/> : <CategoryList categories={categories} onEdit={setCategoryForm} onStatus={changeCategoryStatus} onCreate={() => setCategoryForm(true)}/>}
      </section>
    </div>
    {showProfileForm && (
      <ProfileForm onClose={() => setShowProfileForm(false)} onCreated={async (id) => { await refreshProfiles(); await selectProfile(id); setShowProfileForm(false); }}/>
    )}
    {categoryForm && selectedProfileId && (
      <CategoryForm profileId={selectedProfileId} category={categoryForm === true ? undefined : categoryForm} onClose={() => setCategoryForm(false)} onSaved={async () => { setCategoryForm(false); await loadCategories(); }}/>
    )}
  </div>;
}

function CategoryList({ categories, onEdit, onStatus, onCreate }: { categories: Category[]; onEdit: (category: Category) => void; onStatus: (category: Category) => void; onCreate: () => void }) {
  if (!categories.length) return <EmptyState icon={<Tags/>} title="No categories yet" message="Create the income and expense categories that match how you manage money." action={<button className="button primary" onClick={onCreate}><Plus/> Create category</button>}/>;
  return <div className="category-groups">{(['EXPENSE', 'INCOME'] as const).map((type) => {
    const items = categories.filter((item) => item.type === type);
    return <div className="category-group" key={type}><div className="category-group-title"><span>{type === 'EXPENSE' ? 'Expense categories' : 'Income categories'}</span><b>{items.filter((item) => item.active).length} active</b></div>{items.length ? items.map((category) => <article className={!category.active ? 'archived' : ''} key={category.id}><span className="category-symbol">{category.name.charAt(0).toUpperCase()}</span><div><strong>{category.name}</strong><small>{category.active ? `Used for ${type === 'EXPENSE' ? 'expenses, bills and budgets' : 'income and expected income'}` : 'Archived · history preserved'}</small></div>{category.active ? <><button className="icon-button" aria-label={`Edit ${category.name}`} onClick={() => onEdit(category)}><Edit3/></button><button className="icon-button danger" aria-label={`Archive ${category.name}`} onClick={() => onStatus(category)}><Archive/></button></> : <button className="button secondary tiny" onClick={() => onStatus(category)}><RotateCcw/> Restore</button>}</article>) : <p className="category-empty">No {type.toLowerCase()} categories.</p>}</div>;
  })}</div>;
}

function CategoryForm({ profileId, category, onClose, onSaved }: { profileId: string; category?: Category; onClose: () => void; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget);
    try {
      await api(`/profiles/${profileId}/categories${category ? `/${category.id}` : ''}`, { method: category ? 'PUT' : 'POST', body: JSON.stringify({ name: data.get('name'), ...(!category && { type: data.get('type') }), attachmentRequired: data.get('attachmentRequired') === 'on' }) });
      await onSaved();
    } catch (caught) { setError(messageFrom(caught, `Could not ${category ? 'update' : 'create'} this category.`)); }
    finally { setBusy(false); }
  };
  return <Modal title={category ? 'Edit category' : 'Create category'} description="Money Manager creates the accounting link automatically." onClose={onClose}><form className="form-stack" onSubmit={submit}>{error && <div className="form-error">{error}</div>}<label><span>Category name</span><input name="name" placeholder="e.g. School fees" defaultValue={category?.name} required autoFocus/></label>{category ? <div className="integrity-note"><Tags/><div><strong>{category.type === 'EXPENSE' ? 'Expense' : 'Income'} category</strong><p>The type remains fixed to protect previously posted transactions.</p></div></div> : <label><span>Category type</span><select name="type" defaultValue="EXPENSE"><option value="EXPENSE">Expense</option><option value="INCOME">Income</option></select></label>}<footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : category ? 'Save changes' : 'Create category'}</button></footer></form></Modal>;
}

function ProfileForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); const data = new FormData(event.currentTarget); try { const profile = await api<{ id: string }>('/profiles', { method: 'POST', body: JSON.stringify({ name: data.get('name'), type: data.get('type'), description: data.get('description') || undefined, baseCurrencyCode: 'UGX', financialYearStart: Number(data.get('financialYearStart')) }) }); await onCreated(profile.id); } catch (caught) { setError(messageFrom(caught, 'Could not create this profile.')); } finally { setBusy(false); } };
  return <Modal title="Create a profile" description="A separate financial entity with its own accounts and ledger." onClose={onClose}><form className="form-stack" onSubmit={submit}>{error && <div className="form-error">{error}</div>}<div className="profile-form-icon"><UserRound/></div><label><span>Profile name</span><input name="name" placeholder="e.g. Island Farm" required autoFocus/></label><div className="form-grid"><label><span>Profile type</span><select name="type" defaultValue="BUSINESS"><option value="PERSONAL">Personal</option><option value="BUSINESS">Business</option><option value="INVESTMENT">Investment</option><option value="PROJECT">Project</option><option value="OTHER">Other</option></select></label><label><span>Financial year starts</span><select name="financialYearStart" defaultValue="1">{['January','February','March','April','May','June','July','August','September','October','November','December'].map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label></div><label><span>Description</span><textarea name="description" rows={3} placeholder="What does this profile manage?"/></label><div className="integrity-note"><ShieldCheck/><div><strong>A clean ledger is included</strong><p>After creating the profile, add the income and expense categories that suit it.</p></div></div><footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Creating…' : 'Create profile'}</button></footer></form></Modal>;
}

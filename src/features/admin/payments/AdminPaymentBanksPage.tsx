import { useState } from 'react';
import {
  AsyncBoundary,
  Badge,
  Btn,
  Card,
  DataTable,
  EmptyState,
  FormField,
  Modal,
  Notice,
  PageHeader,
  StatCard,
} from '@/components/ui';
import { toast } from '@/lib/toast';
import { ApiError } from '@/api/errors';
import { useAdminApi, useAdminKeys } from '@/auth/adminContext';
import { useApiQuery, useApiMutation } from '@/api/useApiQuery';
import { useLang } from '@/lib/lang/LanguageContext';
import { num } from '../shared';
import { errorMessage } from './paymentShared';
import type { AdminPaymentBanksResponse, PaymentBank } from '@/api/adminTypes';

interface BankDraft {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  iban: string;
  branch: string;
  instructions: string;
  sortOrder: string;
}

const EMPTY_DRAFT: BankDraft = {
  bankName: '',
  accountHolder: '',
  accountNumber: '',
  iban: '',
  branch: '',
  instructions: '',
  sortOrder: '0',
};

export function AdminPaymentBanksPage() {
  const { STR } = useLang();
  const api = useAdminApi();
  const keys = useAdminKeys();
  const S = STR.admin.payment_banks;

  const query = useApiQuery<AdminPaymentBanksResponse>(
    (signal) => api.admin.paymentBanks(signal),
    [],
    { queryKey: keys.paymentBanks },
  );

  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; bank: PaymentBank | null } | null>(
    null,
  );
  const [draft, setDraft] = useState<BankDraft>(EMPTY_DRAFT);
  const [isActive, setIsActive] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string[]> | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PaymentBank | null>(null);

  const createMutation = useApiMutation(async (body: Record<string, unknown>) =>
    api.admin.createPaymentBank(body),
  );
  const updateMutation = useApiMutation(async (id: number, body: Record<string, unknown>) =>
    api.admin.updatePaymentBank(id, body),
  );
  const toggleMutation = useApiMutation(async (id: number) => api.admin.togglePaymentBank(id));
  const deleteMutation = useApiMutation(async (id: number) => api.admin.deletePaymentBank(id));

  const data = query.data;
  const banks = data?.banks ?? [];
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const bankNameMissing = draft.bankName.trim() === '';
  const accountHolderMissing = draft.accountHolder.trim() === '';
  const accountNumberMissing = draft.accountNumber.trim() === '';

  function fieldError(field: string, missing: boolean): string | undefined {
    const server = serverErrors?.[field]?.[0];
    if (server) return server;
    return missing ? S.required_hint : undefined;
  }

  function openCreate() {
    setDraft(EMPTY_DRAFT);
    setIsActive(false);
    setSubmitted(false);
    setServerErrors(null);
    setFormError(null);
    setModal({ mode: 'create', bank: null });
  }

  function openEdit(bank: PaymentBank) {
    setDraft({
      bankName: bank.bank_name,
      accountHolder: bank.account_holder,
      accountNumber: bank.account_number,
      iban: bank.iban ?? '',
      branch: bank.branch ?? '',
      instructions: bank.instructions ?? '',
      sortOrder: String(bank.sort_order),
    });
    setIsActive(bank.is_active);
    setSubmitted(false);
    setServerErrors(null);
    setFormError(null);
    setModal({ mode: 'edit', bank });
  }

  async function saveBank() {
    setSubmitted(true);
    setServerErrors(null);
    setFormError(null);

    if (bankNameMissing || accountHolderMissing || accountNumberMissing) return;

    const parsedSortOrder = draft.sortOrder.trim() === '' ? 0 : Number(draft.sortOrder);
    const body: Record<string, unknown> = {
      bank_name: draft.bankName.trim(),
      account_holder: draft.accountHolder.trim(),
      account_number: draft.accountNumber.trim(),
      iban: draft.iban.trim() === '' ? null : draft.iban.trim(),
      branch: draft.branch.trim() === '' ? null : draft.branch.trim(),
      instructions: draft.instructions.trim() === '' ? null : draft.instructions.trim(),
      sort_order: Number.isFinite(parsedSortOrder) ? parsedSortOrder : 0,
      is_active: isActive,
    };

    try {
      if (modal?.mode === 'edit' && modal.bank) {
        await updateMutation.run(modal.bank.id, body);
        toast.success(S.updated);
      } else {
        await createMutation.run(body);
        toast.success(S.created);
      }
      setModal(null);
      query.refetch();
    } catch (err) {
      setServerErrors(err instanceof ApiError ? (err.errors ?? null) : null);
      setFormError(errorMessage(err, S.action_failed));
      toast.error(errorMessage(err, S.action_failed));
    }
  }

  async function handleToggle(bank: PaymentBank) {
    try {
      await toggleMutation.run(bank.id);
      toast.success(S.toggled);
      query.refetch();
    } catch (err) {
      toast.error(errorMessage(err, S.action_failed));
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const bank = confirmDelete;
    setConfirmDelete(null);
    try {
      await deleteMutation.run(bank.id);
      toast.success(S.deleted);
      query.refetch();
    } catch (err) {
      toast.error(errorMessage(err, S.action_failed));
    }
  }

  return (
    <>
      <PageHeader
        title={S.title}
        subtitle={S.subtitle}
        icon="fas fa-building-columns"
        actions={
          <Btn variant="primary" icon="fas fa-plus" onClick={openCreate}>
            {S.add}
          </Btn>
        }
      />

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
      >
        {data && (
          <>
            <div className="ph-stats-grid">
              <StatCard
                tone="teal"
                icon="fas fa-building-columns"
                value={`${num(data.active_count)} / ${num(data.max_active)}`}
                label={S.active_count}
              />
            </div>

            <Card>
              <div style={{ marginBlockEnd: 16 }}>
                <Notice tone="info">{S.max_note}</Notice>
              </div>

              {banks.length === 0 ? (
                <EmptyState
                  icon="fas fa-building-columns"
                  title={S.empty}
                  description={S.empty_hint}
                  action={
                    <Btn size="sm" variant="primary" icon="fas fa-plus" onClick={openCreate}>
                      {S.add}
                    </Btn>
                  }
                />
              ) : (
                <DataTable
                  caption={S.title}
                  columns={[
                    S.bank_name,
                    S.account_number,
                    S.branch,
                    S.instructions,
                    S.is_active,
                    { label: S.actions, className: 'ac-actions' },
                  ]}
                >
                  {banks.map((bank) => (
                    <tr key={bank.id}>
                      <td>
                        <strong>{bank.bank_name}</strong>
                        <div className="admin-muted">{bank.account_holder}</div>
                      </td>
                      <td>
                        <span dir="ltr">{bank.account_number}</span>
                        {bank.iban ? (
                          <div className="admin-muted" dir="ltr">
                            {S.iban}: {bank.iban}
                          </div>
                        ) : null}
                      </td>
                      <td>{bank.branch || '—'}</td>
                      <td title={bank.instructions ?? undefined}>{bank.instructions || '—'}</td>
                      <td>
                        <Badge variant={bank.is_active ? 'ok' : 'out'}>
                          {bank.is_active ? S.active : S.inactive}
                        </Badge>
                      </td>
                      <td className="ac-actions">
                        <div className="action-btn-group">
                          <button
                            type="button"
                            className="action-btn edit"
                            title={S.edit}
                            aria-label={`${S.edit} — ${bank.bank_name}`}
                            onClick={() => openEdit(bank)}
                          >
                            <i className="fas fa-pen" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="action-btn view"
                            title={bank.is_active ? S.inactive : S.active}
                            aria-label={`${bank.is_active ? S.inactive : S.active} — ${bank.bank_name}`}
                            disabled={toggleMutation.isPending}
                            onClick={() => handleToggle(bank)}
                          >
                            <i
                              className={bank.is_active ? 'fas fa-toggle-on' : 'fas fa-toggle-off'}
                              aria-hidden="true"
                            />
                          </button>
                          <button
                            type="button"
                            className="action-btn delete"
                            title={S.delete}
                            aria-label={`${S.delete} — ${bank.bank_name}`}
                            disabled={deleteMutation.isPending}
                            onClick={() => setConfirmDelete(bank)}
                          >
                            <i className="fas fa-trash-can" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </Card>
          </>
        )}
      </AsyncBoundary>

      <Modal
        open={modal !== null}
        title={modal?.mode === 'edit' ? S.edit_title : S.create_title}
        onClose={() => setModal(null)}
        footer={
          <>
            <Btn variant="outline" onClick={() => setModal(null)}>
              {STR.admin.common.cancel}
            </Btn>
            <Btn variant="primary" onClick={saveBank} disabled={isSaving}>
              {isSaving ? S.saving : S.save}
            </Btn>
          </>
        }
      >
        {formError ? (
          <div style={{ marginBlockEnd: 16 }}>
            <Notice tone="error">{formError}</Notice>
          </div>
        ) : null}

        <div className="admin-form-grid">
          <FormField
            label={S.bank_name}
            id="payment-bank-name"
            required
            touched={submitted}
            error={fieldError('bank_name', bankNameMissing)}
          >
            <input
              type="text"
              value={draft.bankName}
              onChange={(e) => setDraft((d) => ({ ...d, bankName: e.target.value }))}
            />
          </FormField>

          <FormField
            label={S.account_holder}
            id="payment-bank-account-holder"
            required
            touched={submitted}
            error={fieldError('account_holder', accountHolderMissing)}
          >
            <input
              type="text"
              value={draft.accountHolder}
              onChange={(e) => setDraft((d) => ({ ...d, accountHolder: e.target.value }))}
            />
          </FormField>

          <FormField
            label={S.account_number}
            id="payment-bank-account-number"
            required
            touched={submitted}
            error={fieldError('account_number', accountNumberMissing)}
          >
            <input
              type="text"
              dir="ltr"
              value={draft.accountNumber}
              onChange={(e) => setDraft((d) => ({ ...d, accountNumber: e.target.value }))}
            />
          </FormField>

          <FormField
            label={S.iban}
            id="payment-bank-iban"
            touched={submitted}
            error={fieldError('iban', false)}
          >
            <input
              type="text"
              dir="ltr"
              value={draft.iban}
              onChange={(e) => setDraft((d) => ({ ...d, iban: e.target.value }))}
            />
          </FormField>

          <FormField
            label={S.branch}
            id="payment-bank-branch"
            touched={submitted}
            error={fieldError('branch', false)}
          >
            <input
              type="text"
              value={draft.branch}
              onChange={(e) => setDraft((d) => ({ ...d, branch: e.target.value }))}
            />
          </FormField>

          <FormField
            label={S.sort_order}
            id="payment-bank-sort-order"
            touched={submitted}
            error={fieldError('sort_order', false)}
          >
            <input
              type="number"
              min={0}
              step={1}
              dir="ltr"
              value={draft.sortOrder}
              onChange={(e) => setDraft((d) => ({ ...d, sortOrder: e.target.value }))}
            />
          </FormField>
        </div>

        <div style={{ marginBlockStart: 8 }}>
          <FormField
            label={S.instructions}
            id="payment-bank-instructions"
            touched={submitted}
            error={fieldError('instructions', false)}
          >
            <textarea
              rows={3}
              value={draft.instructions}
              onChange={(e) => setDraft((d) => ({ ...d, instructions: e.target.value }))}
            />
          </FormField>
        </div>

        <label className="admin-switch" style={{ marginBlockStart: 16 }}>
          <input
            type="checkbox"
            role="switch"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span className="admin-switch__track" aria-hidden="true" />
          <span className="admin-switch__label">{S.is_active}</span>
        </label>
      </Modal>

      <Modal
        open={confirmDelete !== null}
        title={S.confirm_delete_title}
        onClose={() => setConfirmDelete(null)}
        footer={
          <>
            <Btn variant="outline" onClick={() => setConfirmDelete(null)}>
              {STR.admin.common.cancel}
            </Btn>
            <Btn variant="danger" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {STR.admin.common.confirm}
            </Btn>
          </>
        }
      >
        <p>{S.confirm_delete_message}</p>
        {confirmDelete && <strong>{confirmDelete.bank_name}</strong>}
      </Modal>
    </>
  );
}

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AsyncBoundary, Btn, Card, FormField, Notice } from '@/components/ui';
import { toast } from '@/lib/toast';
import { usePharmacyApi, usePharmacyKeys } from '@/auth/authHooks';
import { useApiQuery, useApiMutation } from '@/api/useApiQuery';
import { useLang } from '@/lib/lang/useLang';
import type { PharmacyAccountClosureState } from '@/api/pharmacyTypes';

/**
 * قسم «إغلاق الحساب» داخل إعدادات الصيدلية.
 *
 * القواعد كلها في الباك-إند: هذه الشاشة لا تقرر متى يُسمح بالإغلاق، بل تعرض
 * `blockers` كما تصل وتشرح أن الطلب **يُرسل** حتى مع وجود مستحقات، لكن
 * **الإغلاق لا يكتمل** قبل تسويتها.
 *
 * لا يوجد زر «حذف نهائي»: الإغلاق هو ما يحدث فعلًا، وتسميته حذفًا تضليل.
 */
export function AccountClosureSection() {
  const { STR } = useLang();
  const api = usePharmacyApi();
  const keys = usePharmacyKeys();
  const queryClient = useQueryClient();

  const C = STR.pharmacy.account_closure;

  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const query = useApiQuery<PharmacyAccountClosureState>(
    (signal) => api.accountClosureState(signal),
    [],
    { queryKey: keys.accountClosure.detail },
  );

  const mutation = useApiMutation(async (value: string) =>
    api.requestAccountClosure(value),
  );

  const state = query.data;

  async function submit() {
    setError(null);

    try {
      await mutation.run(reason.trim());
      toast.success(C.request_sent);
      setReason('');
      await queryClient.invalidateQueries({ queryKey: keys.accountClosure.all });
    } catch (err) {
      setError(err instanceof Error ? err.message : C.request_failed);
    }
  }

  return (
    <Card>
      <section className="ph-settings-section">
        <header>
          <h2>{C.title}</h2>
          <p>{C.subtitle}</p>
        </header>

        <AsyncBoundary
          isLoading={query.isLoading}
          isError={query.isError}
          error={query.error}
          onRetry={() => void query.refetch()}
        >
          {state?.account_status === 'closed' ? (
            <Notice tone="error">{C.already_closed}</Notice>
          ) : (
            <>
              {/* التحذير دائم — لا يُخفى حتى لا يُفاجأ المالك بالنتيجة. */}
              <Notice tone="warning">{C.warning}</Notice>

              {state && state.blockers.length > 0 && (
                <Notice tone="info">
                  <strong>{C.blockers_title}</strong>
                  <ul>
                    {state.blockers.map((blocker) => (
                      <li key={blocker.key}>
                        {blocker.label} — {blocker.count}
                      </li>
                    ))}
                  </ul>
                  <p>{C.blockers_hint}</p>
                </Notice>
              )}

              {state?.request && (
                <Notice tone={state.request.status === 'rejected' ? 'error' : 'success'}>
                  <strong>{C.request_status}: {C[`status_${state.request.status}` as keyof typeof C] as string}</strong>
                  {state.request.review_note && <p>{C.review_note}: {state.request.review_note}</p>}
                </Notice>
              )}

              {state?.request?.status !== 'pending' && (
                <>
                  <FormField label={C.reason} hint={C.reason_hint}>
                    <textarea
                      rows={3}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </FormField>

                  {error && <Notice tone="error">{error}</Notice>}

                  <Btn
                    variant="danger"
                    disabled={mutation.isPending}
                    onClick={() => void submit()}
                  >
                    {mutation.isPending ? C.submitting : C.submit}
                  </Btn>
                </>
              )}
            </>
          )}
        </AsyncBoundary>
      </section>
    </Card>
  );
}

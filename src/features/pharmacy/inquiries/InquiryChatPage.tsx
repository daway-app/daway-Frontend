import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AR } from '@/lib/i18n';
import { AsyncBoundary, Notice } from '@/components/ui';
import { usePharmacyApi } from '@/auth/authHooks';
import { useApiMutation, useApiQuery } from '@/api/useApiQuery';
import { formatDateTime, formatTime } from '@/lib/format';
import type { ApiInquiry, ApiInquiryMessage } from '@/api/pharmacyTypes';

/**
 * Pharmacy inquiry chat — live against the real endpoints.
 *
 * Port of `resources/views/pharmacy/inquiries/chat.blade.php`.
 *
 * Data sources:
 *  - conversation → `GET /api/pharmacy/inquiries/{id}`
 *  - thread       → `GET /api/pharmacy/inquiries/{id}/messages` (with `mark_read`)
 *  - send         → `POST /api/pharmacy/inquiries/{id}/messages`
 *
 * Two contract details:
 *  - **`is_mine` is computed server-side** against the authenticated user, so the
 *    bubble side is read from it rather than comparing user ids locally. That
 *    also removes the mock's hard-coded pharmacy user id.
 *  - the payload field is `media_url` (the mock called it `media_path`) and the
 *    timestamp is `created_at` (the mock stored a pre-formatted `time`).
 *
 * ⚠️ The Blade page polls every 4s. That poll is deliberately NOT reproduced:
 * measured TTFB against this backend is ~4s (remote managed MySQL), so a 4s
 * poll would queue requests back-to-back and keep the connection saturated. A
 * manual refresh button replaces it, and `mark_read` still fires on mount and on
 * tab-visibility change, matching the Blade behaviour that matters.
 */

const I = AR.pharmacy.inquiries;

const BADGE_CLASS: Record<string, string> = {
  new: 'new',
  answered: 'ans',
  closed: 'closed',
};

const STATUS_LABEL: Record<string, string> = {
  new: I.status_new,
  answered: I.status_answered,
  closed: I.status_closed,
};

export function InquiryChatPage() {
  const { id } = useParams<{ id: string }>();
  const api = usePharmacyApi();

  const [draft, setDraft] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const inquiryQuery = useApiQuery<ApiInquiry>((signal) => api.inquiry(String(id), signal), [id], {
    isEmpty: () => false,
  });

  const messagesQuery = useApiQuery<{ data: ApiInquiryMessage[] }>(
    (signal) => api.inquiryMessages(String(id), { markRead: true, signal }),
    [id],
    { isEmpty: (r) => r.data.length === 0 },
  );

  const sendMessage = useApiMutation((body: { message: string }) =>
    api.sendInquiryMessage(String(id), body),
  );

  const messages = useMemo(() => messagesQuery.data?.data ?? [], [messagesQuery.data]);
  const inquiry = inquiryQuery.data;

  /** Blade marks read again when the tab becomes visible. */
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') messagesQuery.refetch();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [messagesQuery]);

  /** Keep the newest message in view as the thread grows. */
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send() {
    const text = draft.trim();
    if (text === '') return;
    try {
      await sendMessage.run({ message: text });
      setDraft('');
      messagesQuery.refetch();
    } catch {
      // `sendMessage.error` renders below the composer.
    }
  }

  const status = inquiry?.status ?? 'new';

  return (
    <div className="ph-page">
      <div className="ph-head">
        <div className="ph-page-title">
          <h1>
            <i
              className="fas fa-comment-dots"
              style={{ color: 'var(--ph-teal-text)', marginInlineEnd: 10 }}
            />
            {I.chat_title}
          </h1>
          <p>{I.chat_subtitle}</p>
        </div>
        <div className="ph-actions">
          <button
            type="button"
            className="ph-btn ghost"
            disabled={messagesQuery.isRefetching}
            onClick={() => {
              inquiryQuery.refetch();
              messagesQuery.refetch();
            }}
          >
            <i className="fas fa-rotate" /> {I.refresh}
          </button>
          <Link to="/inquiries" className="ph-btn ghost">
            <i className="fas fa-arrow-right" /> {I.back_to_inquiries}
          </Link>
        </div>
      </div>

      <AsyncBoundary
        isLoading={inquiryQuery.isLoading || messagesQuery.isLoading}
        isError={inquiryQuery.isError || messagesQuery.isError}
        error={inquiryQuery.error ?? messagesQuery.error}
        onRetry={() => {
          inquiryQuery.refetch();
          messagesQuery.refetch();
        }}
        loadingRows={4}
      >
        {/* Conversation header */}
        <div className="ph-card" style={{ marginBlockEnd: 20 }}>
          <div className="ph-card-head" style={{ borderBlockEnd: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fas fa-user" style={{ color: 'var(--ph-teal-text)' }} />
                <strong style={{ fontSize: '1rem' }}>
                  {inquiry?.user?.name ?? I.patient_fallback ?? 'مريض'}
                </strong>
              </div>
              <span className={`ph-badge ${BADGE_CLASS[status] ?? 'new'}`}>
                {STATUS_LABEL[status] ?? status}
              </span>
            </div>
            {inquiry?.medicine?.trade_name && (
              <div style={{ fontSize: '.85rem', color: 'var(--ph-ink-faint)', marginBlockStart: 4 }}>
                <i className="fas fa-pills" style={{ marginInlineEnd: 6 }} />
                {inquiry.medicine.trade_name}
              </div>
            )}
            {inquiry?.created_at && (
              <div style={{ fontSize: '.8rem', color: 'var(--ph-ink-faint)', marginBlockStart: 4 }}>
                <i className="fas fa-clock" style={{ marginInlineEnd: 6 }} />
                {formatDateTime(inquiry.created_at)}
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="ph-card ph-chat-messages" id="ph-chat-messages">
          <div
            ref={listRef}
            className="ph-card-body"
            style={{ padding: 0, overflowY: 'auto', maxHeight: '60vh', minHeight: 200 }}
          >
            {messages.length > 0 ? (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`ph-chat-bubble ${msg.is_mine ? 'ph-chat-mine' : 'ph-chat-other'}`}
                  data-msg-id={msg.id}
                >
                  <div className="ph-chat-text">
                    {msg.media_url ? (
                      <>
                        <a href={msg.media_url} target="_blank" rel="noreferrer">
                          <img
                            src={msg.media_url}
                            alt=""
                            style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8 }}
                          />
                        </a>
                        {msg.message && <div style={{ marginBlockStart: 8 }}>{msg.message}</div>}
                      </>
                    ) : (
                      msg.message
                    )}
                  </div>
                  <div className="ph-chat-meta">
                    <span className="ph-chat-time">{formatTime(msg.created_at)}</span>
                    {/* Read receipts are only meaningful on incoming messages. */}
                    {!msg.is_mine && msg.is_read && (
                      <i
                        className="fas fa-check-double"
                        title={I.msg_read}
                        style={{ fontSize: '.7rem' }}
                      />
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="ph-empty" style={{ padding: '40px 20px' }}>
                <i
                  className="fas fa-message"
                  style={{ fontSize: '2rem', color: 'var(--ph-ink-faint)', marginBlockEnd: 10 }}
                />
                <h3>{I.chat_no_messages}</h3>
              </div>
            )}
          </div>
        </div>

        {/* Reply form */}
        <form
          action="#"
          method="POST"
          className="ph-chat-input-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div className="ph-chat-input-row">
            <input
              type="text"
              name="message"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={I.chat_send_placeholder}
              maxLength={1000}
              autoComplete="off"
              style={{
                flex: 1,
                background: 'var(--ph-paper)',
                border: '1px solid var(--ph-line-soft)',
                borderRadius: 'var(--ph-r-md)',
                padding: '12px 16px',
                fontSize: '.95rem',
                color: 'var(--ph-ink)',
                outline: 'none',
                transition: 'var(--ph-tr)',
              }}
            />
            <label
              htmlFor="ph-chat-media"
              className="ph-btn ghost"
              style={{ borderRadius: 'var(--ph-r-md)', padding: '12px 16px', cursor: 'pointer' }}
            >
              <i className="fas fa-paperclip" />
            </label>
            <input
              ref={fileRef}
              type="file"
              id="ph-chat-media"
              name="media"
              accept="image/*"
              style={{ display: 'none' }}
            />
            <button
              type="submit"
              className="ph-btn primary"
              disabled={sendMessage.isPending || draft.trim() === ''}
              style={{ borderRadius: 'var(--ph-r-md)', padding: '12px 20px', fontSize: '.95rem' }}
            >
              <i className="fas fa-paper-plane" />
            </button>
          </div>

          {sendMessage.error && (
            <Notice tone="error">{sendMessage.error.message}</Notice>
          )}
        </form>
      </AsyncBoundary>
    </div>
  );
}

import { useMemo } from 'react';
import { AsyncBoundary, Badge, Btn, PageHeader } from '@/components/ui';
import { useAdminApi, useAdminKeys } from '@/auth/adminContext';
import { useApiQuery } from '@/api/useApiQuery';
import { useLang } from '@/lib/lang/useLang';
import { thumbUrl } from '@/lib/format';
import { ADMIN_ROUTES } from '@/routes/adminPaths';
import type { AdminProfile } from '@/api/adminTypes';

/**
 * Admin profile — display-only, styled after the pharmacy profile page.
 *
 * ============================================================================
 * LAYOUT (mirrors `pharmacy/profile/edit.blade.php`'s banner)
 * ============================================================================
 *   · a gradient banner with the name inside it;
 *   · the avatar as a large circle overlapping the banner's bottom edge;
 *   · the details (name / email / phone) CENTRED beneath it;
 *   · a row of actions UNDER the details — the pharmacy page puts its actions
 *     at the bottom of the card, not in the header, and that is what makes the
 *     avatar/banner read as one hero block.
 *
 * The user's request for this screen was explicit about that arrangement, so
 * the markup is ordered: banner → avatar → centred facts → actions. It is NOT
 * a two-column "main + side" grid like the pharmacy page, because an admin
 * profile has no second column of content to fill.
 *
 * ============================================================================
 * 🔴 WHY THERE IS NO "EDIT" ANYWHERE
 * ============================================================================
 * The signed-in admin's name/email/phone are provisioning data: there is no
 * self-service edit form on the Blade side and no PUT on the API
 * (`ProfileController@show` is a GET). Rendering editable inputs would imply an
 * affordance that does not exist, so the facts are display-only `<dl>` rows.
 *
 * ============================================================================
 * 🔴 "تغيير الصورة" IS PRESENT BUT INERT — ON PURPOSE
 * ============================================================================
 * The user asked for a photo button beside the password one. There is no
 * admin avatar-upload endpoint (an API-contract addition with no backend
 * behind it), so the button renders in the real position and VISIBLY DISABLED
 * with an explanatory tooltip — rather than being omitted (which would look
 * like a missing feature) or shipped as a live button that always fails.
 * This is a documented gap, and the note under the actions says so.
 */
/** First letter of the name — the avatar fallback (mirrors the sidebar). */
function initial(name: string): string {
  return name.trim().charAt(0) || '؟';
}

export function AdminProfilePage() {
  const { STR } = useLang();
  const P = STR.admin.profile;
  const api = useAdminApi();
  const keys = useAdminKeys();

  const query = useApiQuery<{ user: AdminProfile }>(
    (signal) => api.admin.profile(signal),
    [],
    // A profile always has content; never flash an empty state for it.
    { queryKey: keys.profile, isEmpty: () => false },
  );

  const profile = query.data?.user;

  const avatar = useMemo(
    () => thumbUrl(profile?.avatar_url ?? null, 200, 200),
    [profile?.avatar_url],
  );

  return (
    <div className="admin-page">
      <PageHeader title={P.title} subtitle={P.subtitle} icon="fas fa-id-card" />

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
      >
        {profile && (
          <div className="adp-card">
            {/* ── Banner: gradient block carrying the name ─────────────── */}
            <div className="adp-banner">
              <h2>{profile.name}</h2>
              <Badge variant="new">{P.role_admin}</Badge>
            </div>

            {/* ── Avatar: large circle overlapping the banner edge ─────── */}
            <div className="adp-avatar-wrap">
              <div className="adp-avatar">
                {avatar ? (
                  <img
                    src={avatar}
                    alt={profile.name}
                    width={132}
                    height={132}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span aria-hidden="true">{initial(profile.name)}</span>
                )}
              </div>
            </div>

            {/* ── Facts: centred, label above value ────────────────────── */}
            <dl className="adp-facts">
              <div className="adp-fact">
                <dt>{P.label_name}</dt>
                <dd>{profile.name || P.missing}</dd>
              </div>
              <div className="adp-fact">
                <dt>{P.label_email}</dt>
                {/* `dir="ltr"` so an email never renders with its punctuation
                    on the wrong side under RTL. */}
                <dd dir="ltr">{profile.email || P.missing}</dd>
              </div>
              <div className="adp-fact">
                <dt>{P.label_phone}</dt>
                <dd dir="ltr">{profile.phone || P.missing}</dd>
              </div>
            </dl>

            {/* ── Actions: side by side, under the details ─────────────── */}
            <div className="adp-actions">
              <button
                type="button"
                className="ph-btn outline"
                disabled
                title={P.change_photo_unavailable}
                aria-describedby="adp-photo-note"
              >
                <i className="fas fa-camera" aria-hidden="true" /> {P.change_photo}
              </button>

              <Btn variant="primary" to={ADMIN_ROUTES.profilePassword} icon="fas fa-key">
                {P.change_password_button}
              </Btn>
            </div>

            {/* Explains WHY the photo button cannot be used — a disabled
                control with no reason is worse than no control. */}
            <p className="adp-note" id="adp-photo-note">
              <i className="fas fa-circle-info" aria-hidden="true" /> {P.change_photo_unavailable}
            </p>
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}


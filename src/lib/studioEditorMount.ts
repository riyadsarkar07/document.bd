export type StudioEditorMount = 'mount' | 'wait-session' | 'login' | 'blocked' | 'disabled';

/**
 * Editor chrome mounts from a live session. A missing profiles row must not
 * hold TIN / DL / Dubai / UNHCR / S2 on a spinner or bounce them to /studio.
 */
export function resolveStudioEditorMount(params: {
  hasSession?: boolean;
  sessionLoading?: boolean;
  profileReady?: boolean;
  hasToolAccess?: boolean;
  disabled?: boolean;
}): StudioEditorMount {
  if (params.disabled) return 'disabled';
  if (params.profileReady && params.hasToolAccess === false) return 'blocked';
  if (params.hasSession) return 'mount';
  if (params.sessionLoading) return 'wait-session';
  return 'login';
}

export function isStudioEditorPath(pathname: string | null | undefined): boolean {
  const path = (pathname ?? '').trim();
  return path === '/studio/editor' || path.startsWith('/studio/editor/');
}

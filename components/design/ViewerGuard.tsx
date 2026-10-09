'use client';

import { Component, useState, type ReactNode } from 'react';
import * as Sentry from '@sentry/nextjs';
import { AlertTriangle, Box } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/client';

/**
 * What stands between the 3D view and a page that dies with it (docs/design-studio/3d-engine.md#when-the-3d-view-fails).
 *
 * - **No WebGL** (switched off, a blocked GPU, an old tablet): said at once, in the person's
 *   language. R3F's renderer used to reject unhandled, the loading screen spun for its 45 s cap
 *   and left a blank canvas.
 * - **A builder that throws** (a plan the 3D code cannot draw): the view says so and offers to
 *   try again, the error goes to Sentry, and the trays, the 2D board and the rest of the page
 *   stay usable. It used to take the whole studio down to the page's error screen.
 */

/** Whether this browser can give the page a WebGL context at all. Asked once. */
let webgl: boolean | null = null;
export function webglAvailable(): boolean {
  if (webgl != null) return webgl;
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    webgl = !!context;
    (context as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webgl = false;
  }
  return webgl;
}

function Notice({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div role="alert" className="absolute inset-0 grid place-items-center bg-bg-base/95 p-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-warning/15 text-warning">{icon}</div>
        <p className="font-serif text-lg text-ink">{title}</p>
        <p className="mt-1 text-sm text-ink-muted">{text}</p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

class Boundary extends Component<{ fallback: (retry: () => void) => ReactNode; onRetry: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    Sentry.captureException(error, { tags: { area: 'viewer3d' } });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return this.props.fallback(() => {
      this.setState({ failed: false });
      this.props.onRetry();
    });
  }
}

/** The 3D view, or what to say instead of it. */
export function ViewerGuard({ children }: { children: ReactNode }) {
  const t = useT();
  // A retry mounts the view anew (a new canvas, the scene built again).
  const [attempt, setAttempt] = useState(0);
  const [supported] = useState(() => typeof document === 'undefined' || webglAvailable());
  if (!supported) return <Notice icon={<Box className="h-5 w-5" />} title={t.build.noWebglTitle} text={t.build.noWebglText} />;
  return (
    <Boundary
      key={attempt}
      onRetry={() => setAttempt((n) => n + 1)}
      fallback={(retry) => (
        <Notice
          icon={<AlertTriangle className="h-5 w-5" />}
          title={t.build.viewerFailedTitle}
          text={t.build.viewerFailedText}
          action={
            <Button size="sm" variant="ink" onClick={retry}>
              {t.hub.retry}
            </Button>
          }
        />
      )}
    >
      {children}
    </Boundary>
  );
}

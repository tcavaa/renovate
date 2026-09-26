import { ProjectGate } from '@/components/projects/ProjectGate';
import { DesignAutosave } from '@/components/design/DesignAutosave';
import { loadProjectForSteps } from '@/lib/projects/loadForSteps';

export const dynamic = 'force-dynamic';

/**
 * The studio's steps, inside one project: the caller's own, read from the server and opened
 * in the browser by `ProjectGate` before any step renders. Everything done here is written
 * back into it as the person works (`DesignAutosave`).
 */
export default async function DesignProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { project, userId } = await loadProjectForSteps((await params).id, 'design');
  return (
    <ProjectGate journey="design" project={project} userId={userId}>
      <DesignAutosave projectId={project.id} />
      {children}
    </ProjectGate>
  );
}

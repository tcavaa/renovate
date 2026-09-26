import { ProjectGate } from '@/components/projects/ProjectGate';
import { CalculatorAutosave } from '@/components/calculator/CalculatorAutosave';
import { loadProjectForSteps } from '@/lib/projects/loadForSteps';

export const dynamic = 'force-dynamic';

/**
 * The calculator's steps, inside one project: the caller's own, read from the server and
 * opened in the browser by `ProjectGate` before any step renders. Everything done here is
 * written back into it as the person works (`CalculatorAutosave`).
 */
export default async function CalculatorProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { project, userId } = await loadProjectForSteps((await params).id, 'calculator');
  return (
    <ProjectGate journey="calculator" project={project} userId={userId}>
      <CalculatorAutosave projectId={project.id} />
      {children}
    </ProjectGate>
  );
}

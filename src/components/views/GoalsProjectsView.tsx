import React, { useEffect, useState } from 'react';
import { Check, Edit2, FolderKanban, Plus, Target, Trash2 } from 'lucide-react';
import { AppState, Goal, LifeArea, Milestone, Project, ProjectTaskItem } from '../../types';
import { createId, LIFE_AREAS } from '../../data/starterData';
import { formatDisplayDate, KarachiNow } from '../../utils/dateUtils';
import { Modal } from '../ui/Modal';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface GoalsProjectsViewProps {
  state: AppState;
  now: KarachiNow;
  initialTab?: 'goals' | 'projects';
  onTabChange?: (tab: 'goals' | 'projects') => void;
  onAddGoal: (goal: Goal) => void;
  onUpdateGoal: (goal: Goal) => void;
  onDeleteGoal: (goalId: string) => void;
  onAddProject: (project: Project) => void;
  onUpdateProject: (project: Project) => void;
  onDeleteProject: (projectId: string) => void;
}

const GOAL_STATUS_LABELS: Record<Goal['status'], string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
  paused: 'Paused',
};

const PROJECT_STATUS_LABELS: Record<Project['status'], string> = {
  planning: 'Planning',
  active: 'Active',
  completed: 'Completed',
  on_hold: 'On Hold',
};

export function GoalsProjectsView({
  state,
  now,
  initialTab = 'goals',
  onTabChange,
  onAddGoal,
  onUpdateGoal,
  onDeleteGoal,
  onAddProject,
  onUpdateProject,
  onDeleteProject,
}: GoalsProjectsViewProps) {
  const [activeTab, setActiveTab] = useState<'goals' | 'projects'>(initialTab);
  const [areaFilter, setAreaFilter] = useState<'All' | LifeArea>('All');

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const switchTab = (tab: 'goals' | 'projects') => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  // Goal Modal State
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [gArea, setGArea] = useState<LifeArea>(LIFE_AREAS[0]);
  const [gTitle, setGTitle] = useState('');
  const [gDesc, setGDesc] = useState('');
  const [gDeadline, setGDeadline] = useState(now.dateStr);
  const [gStatus, setGStatus] = useState<Goal['status']>('in_progress');
  const [gNotes, setGNotes] = useState('');
  const [gMilestonesText, setGMilestonesText] = useState('');
  const [gLinkedTasks, setGLinkedTasks] = useState('');

  // Project Modal State
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [pTitle, setPTitle] = useState('');
  const [pType, setPType] = useState<Project['type']>('technical');
  const [pDesc, setPDesc] = useState('');
  const [pStatus, setPStatus] = useState<Project['status']>('active');
  const [pDeadline, setPDeadline] = useState(now.dateStr);
  const [pTasksText, setPTasksText] = useState('');
  const [pNotes, setPNotes] = useState('');
  const [pLink, setPLink] = useState('');

  const [deletingGoal, setDeletingGoal] = useState<Goal | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);

  const openGoalModal = (goal?: Goal, presetArea?: LifeArea) => {
    if (goal) {
      setEditingGoal(goal);
      setGArea(goal.area);
      setGTitle(goal.title);
      setGDesc(goal.description);
      setGDeadline(goal.deadline);
      setGStatus(goal.status);
      setGNotes(goal.notes);
      setGMilestonesText(goal.milestones.map((m) => m.title).join('\n'));
      setGLinkedTasks(goal.linkedTaskTitles.join(', '));
    } else {
      setEditingGoal(null);
      setGArea(presetArea || LIFE_AREAS[0]);
      setGTitle('');
      setGDesc('');
      setGDeadline(now.dateStr);
      setGStatus('in_progress');
      setGNotes('');
      setGMilestonesText('');
      setGLinkedTasks('');
    }
    setGoalModalOpen(true);
  };

  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gTitle.trim()) return;

    const lines = gMilestonesText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const existingMap = new Map(
      (editingGoal?.milestones || []).map((m) => [m.title, m.completed])
    );

    const milestones: Milestone[] = lines.map((line) => ({
      id: createId('ms'),
      title: line,
      completed: existingMap.get(line) ?? false,
    }));

    const linkedTaskTitles = gLinkedTasks
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const payload: Goal = {
      id: editingGoal?.id || createId('goal'),
      area: gArea,
      title: gTitle.trim(),
      description: gDesc.trim(),
      deadline: gDeadline,
      status: gStatus,
      milestones,
      notes: gNotes.trim(),
      linkedTaskTitles,
    };

    if (editingGoal) onUpdateGoal(payload);
    else onAddGoal(payload);
    setGoalModalOpen(false);
  };

  const toggleMilestone = (goal: Goal, milestoneId: string) => {
    const updatedMilestones = goal.milestones.map((m) =>
      m.id === milestoneId ? { ...m, completed: !m.completed } : m
    );
    const allDone =
      updatedMilestones.length > 0 && updatedMilestones.every((m) => m.completed);
    onUpdateGoal({
      ...goal,
      milestones: updatedMilestones,
      status: allDone ? 'completed' : goal.status === 'completed' ? 'in_progress' : goal.status,
    });
  };

  const openProjectModal = (project?: Project) => {
    if (project) {
      setEditingProject(project);
      setPTitle(project.title);
      setPType(project.type);
      setPDesc(project.description);
      setPStatus(project.status);
      setPDeadline(project.deadline);
      setPTasksText(project.tasks.map((t) => t.title).join('\n'));
      setPNotes(project.notes);
      setPLink(project.link || '');
    } else {
      setEditingProject(null);
      setPTitle('');
      setPType('technical');
      setPDesc('');
      setPStatus('active');
      setPDeadline(now.dateStr);
      setPTasksText('');
      setPNotes('');
      setPLink('');
    }
    setProjectModalOpen(true);
  };

  const handleSaveProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pTitle.trim()) return;

    const existingMap = new Map(
      (editingProject?.tasks || []).map((t) => [t.title, t.completed])
    );
    const tasks: ProjectTaskItem[] = pTasksText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => ({
        id: createId('pt'),
        title: line,
        completed: existingMap.get(line) ?? false,
      }));

    const payload: Project = {
      id: editingProject?.id || createId('proj'),
      title: pTitle.trim(),
      type: pType,
      description: pDesc.trim(),
      status: pStatus,
      deadline: pDeadline,
      tasks,
      notes: pNotes.trim(),
      link: pLink.trim() || undefined,
    };

    if (editingProject) onUpdateProject(payload);
    else onAddProject(payload);
    setProjectModalOpen(false);
  };

  const toggleProjectTask = (project: Project, taskId: string) => {
    const updatedTasks = project.tasks.map((t) =>
      t.id === taskId ? { ...t, completed: !t.completed } : t
    );
    onUpdateProject({ ...project, tasks: updatedTasks });
  };

  const visibleAreas = areaFilter === 'All' ? LIFE_AREAS : [areaFilter];

  return (
    <div className="space-y-6">
      {/* Header + Segmented View Switch */}
      <div className="bg-card border border-subtle rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-main">Goals &amp; Projects</h1>
          <p className="text-xs text-muted mt-1">
            Translate long-term life pillars into milestones, assigned routine blocks, and shipped projects.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-surface border border-subtle rounded-lg">
            <button
              type="button"
              onClick={() => switchTab('goals')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'goals'
                  ? 'bg-gold text-on-gold font-semibold'
                  : 'text-muted hover:text-main'
              }`}
            >
              <Target className="w-3.5 h-3.5" />
              Life Goals ({state.goals.length})
            </button>
            <button
              type="button"
              onClick={() => switchTab('projects')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'projects'
                  ? 'bg-gold text-on-gold font-semibold'
                  : 'text-muted hover:text-main'
              }`}
            >
              <FolderKanban className="w-3.5 h-3.5" />
              Projects ({state.projects.length})
            </button>
          </div>

          {activeTab === 'goals' ? (
            <button
              type="button"
              onClick={() => openGoalModal()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-on-gold bg-gold hover:bg-gold-hover rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Goal
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openProjectModal()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-on-gold bg-gold hover:bg-gold-hover rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Project
            </button>
          )}
        </div>
      </div>

      {activeTab === 'goals' ? (
        <div className="space-y-6">
          {/* Life Area Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAreaFilter('All')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                areaFilter === 'All'
                  ? 'bg-gold-soft border-gold-border text-gold font-semibold'
                  : 'bg-card border-subtle text-muted hover:text-main'
              }`}
            >
              All 5 Areas
            </button>
            {LIFE_AREAS.map((area) => (
              <button
                key={area}
                type="button"
                onClick={() => setAreaFilter(area)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                  areaFilter === area
                    ? 'bg-gold-soft border-gold-border text-gold font-semibold'
                    : 'bg-card border-subtle text-muted hover:text-main'
                }`}
              >
                {area}
              </button>
            ))}
          </div>

          {visibleAreas.map((area, areaIdx) => {
            const areaGoals = state.goals.filter((g) => g.area === area);
            return (
              <section
                key={area}
                className="bg-card border border-subtle rounded-xl overflow-hidden"
              >
                <div className="px-6 py-4 border-b border-subtle flex items-center justify-between gap-4 bg-surface">
                  <div>
                    <h2 className="text-base font-semibold text-main">
                      0{areaIdx + 1}. {area}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => openGoalModal(undefined, area)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-gold hover:text-gold-hover whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Goal Here
                  </button>
                </div>

                {areaGoals.length === 0 ? (
                  <div className="p-6 text-xs text-muted">
                    No goals defined for this life area yet.
                  </div>
                ) : (
                  <div className="divide-y divide-subtle">
                    {areaGoals.map((goal) => {
                      const doneCount = goal.milestones.filter((m) => m.completed).length;
                      const pct =
                        goal.milestones.length > 0
                          ? Math.round((doneCount / goal.milestones.length) * 100)
                          : goal.status === 'completed'
                          ? 100
                          : 0;

                      return (
                        <div key={goal.id} className="p-6 space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                                <span
                                  className={
                                    goal.status === 'completed'
                                      ? 'text-slate-accent font-medium'
                                      : goal.status === 'in_progress'
                                      ? 'text-gold font-medium'
                                      : 'text-muted'
                                  }
                                >
                                  {GOAL_STATUS_LABELS[goal.status]}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums">
                                  Deadline: {formatDisplayDate(goal.deadline)}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums text-main">
                                  {pct}% progress
                                </span>
                              </div>
                              <h3 className="text-base font-semibold text-main">{goal.title}</h3>
                              {goal.description && (
                                <p className="text-sm text-muted leading-relaxed">
                                  {goal.description}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <select
                                aria-label={`Status for ${goal.title}`}
                                value={goal.status}
                                onChange={(e) =>
                                  onUpdateGoal({
                                    ...goal,
                                    status: e.target.value as Goal['status'],
                                  })
                                }
                                className="px-2.5 py-1.5 bg-surface border border-subtle rounded-lg text-xs text-main focus:outline-none focus:border-gold"
                              >
                                <option value="not_started">Not Started</option>
                                <option value="in_progress">In Progress</option>
                                <option value="completed">Completed</option>
                                <option value="paused">Paused</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => openGoalModal(goal)}
                                className="p-2 text-muted hover:text-main bg-surface border border-subtle hover:border-gold-border rounded-lg transition-colors"
                                aria-label={`Edit ${goal.title}`}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingGoal(goal)}
                                className="p-2 text-muted hover:text-rose-muted bg-surface border border-subtle hover:border-rose-border rounded-lg transition-colors"
                                aria-label={`Delete ${goal.title}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                pct === 100 ? 'bg-slate-accent' : 'bg-gold'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>

                          {/* Milestones */}
                          {goal.milestones.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {goal.milestones.map((ms) => (
                                <button
                                  key={ms.id}
                                  type="button"
                                  onClick={() => toggleMilestone(goal, ms.id)}
                                  className="flex items-start gap-2.5 p-2.5 rounded-lg bg-surface border border-subtle hover:border-gold-border text-left transition-colors"
                                >
                                  <span
                                    className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                      ms.completed
                                        ? 'bg-slate-accent border-slate-accent text-on-slate'
                                        : 'border-subtle bg-card'
                                    }`}
                                  >
                                    {ms.completed && <Check className="w-3 h-3 stroke-[2.5]" />}
                                  </span>
                                  <span
                                    className={`text-xs leading-snug ${
                                      ms.completed
                                        ? 'line-through text-muted'
                                        : 'text-main'
                                    }`}
                                  >
                                    {ms.title}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Linked Routine Tasks & Notes */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-muted pt-1">
                            <div>
                              {goal.linkedTaskTitles.length > 0 && (
                                <span>
                                  Assigned daily blocks:{' '}
                                  <strong className="font-medium text-main">
                                    {goal.linkedTaskTitles.join(' · ')}
                                  </strong>
                                </span>
                              )}
                            </div>
                            {goal.notes && (
                              <span className="text-muted italic">Note: {goal.notes}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        /* Technical & Creative Projects Section */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {state.projects.length === 0 ? (
            <div className="lg:col-span-2 bg-card border border-subtle rounded-xl p-10 text-center space-y-3">
              <p className="text-sm text-muted">
                No technical or creative projects added yet.
              </p>
              <button
                type="button"
                onClick={() => openProjectModal()}
                className="px-4 py-2 text-xs font-semibold text-on-gold bg-gold hover:bg-gold-hover rounded-lg"
              >
                Create First Project
              </button>
            </div>
          ) : (
            state.projects.map((project) => {
              const done = project.tasks.filter((t) => t.completed).length;
              const pct =
                project.tasks.length > 0
                  ? Math.round((done / project.tasks.length) * 100)
                  : project.status === 'completed'
                  ? 100
                  : 0;

              return (
                <section
                  key={project.id}
                  className="bg-card border border-subtle rounded-xl p-6 space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <span className="capitalize text-gold font-medium">
                            {project.type} project
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{PROJECT_STATUS_LABELS[project.status]}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            Due {formatDisplayDate(project.deadline)}
                          </span>
                        </div>
                        <h3 className="text-lg font-semibold text-main mt-1">
                          {project.title}
                        </h3>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openProjectModal(project)}
                          className="p-2 text-muted hover:text-main bg-surface border border-subtle hover:border-gold-border rounded-lg transition-colors"
                          aria-label={`Edit ${project.title}`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingProject(project)}
                          className="p-2 text-muted hover:text-rose-muted bg-surface border border-subtle hover:border-rose-border rounded-lg transition-colors"
                          aria-label={`Delete ${project.title}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {project.description && (
                      <p className="text-sm text-muted leading-relaxed">
                        {project.description}
                      </p>
                    )}

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1.5 font-mono tabular-nums">
                        <span className="text-muted">
                          Deliverables ({done}/{project.tasks.length})
                        </span>
                        <span className="text-main font-medium">{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                        <div
                          className="h-full bg-slate-accent transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2 pt-1">
                      {project.tasks.map((pt) => (
                        <button
                          key={pt.id}
                          type="button"
                          onClick={() => toggleProjectTask(project, pt.id)}
                          className="w-full flex items-start gap-2.5 p-2.5 rounded-lg bg-surface border border-subtle hover:border-gold-border text-left transition-colors"
                        >
                          <span
                            className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              pt.completed
                                ? 'bg-slate-accent border-slate-accent text-on-slate'
                                : 'border-subtle bg-card'
                            }`}
                          >
                            {pt.completed && <Check className="w-3 h-3 stroke-[2.5]" />}
                          </span>
                          <span
                            className={`text-xs ${
                              pt.completed
                                ? 'line-through text-muted'
                                : 'text-main'
                            }`}
                          >
                            {pt.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {project.notes && (
                    <p className="text-xs text-muted pt-3 border-t border-subtle">
                      Notes: {project.notes}
                    </p>
                  )}
                </section>
              );
            })
          )}
        </div>
      )}

      {/* Goal Modal */}
      <Modal
        open={goalModalOpen}
        onClose={() => setGoalModalOpen(false)}
        title={editingGoal ? 'Edit Life Goal' : 'Create Life Goal'}
      >
        <form onSubmit={handleSaveGoal} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">
                Life Area
              </label>
              <select
                value={gArea}
                onChange={(e) => setGArea(e.target.value as LifeArea)}
                className="w-full px-3 py-2.5 bg-surface border border-subtle rounded-lg text-sm text-main focus:outline-none focus:border-gold"
              >
                {LIFE_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">
                Deadline
              </label>
              <input
                type="date"
                value={gDeadline}
                onChange={(e) => setGDeadline(e.target.value)}
                className="w-full px-3 py-2.5 bg-surface border border-subtle rounded-lg text-sm font-mono tabular-nums text-main focus:outline-none focus:border-gold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Goal Title</label>
            <input
              type="text"
              value={gTitle}
              onChange={(e) => setGTitle(e.target.value)}
              placeholder="e.g., Complete 45 hours of Data Structures & Projects"
              className="w-full px-3.5 py-2.5 bg-surface border border-subtle rounded-lg text-sm text-main focus:outline-none focus:border-gold"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Description</label>
            <textarea
              rows={2}
              value={gDesc}
              onChange={(e) => setGDesc(e.target.value)}
              className="w-full px-3.5 py-2 bg-surface border border-subtle rounded-lg text-sm text-main focus:outline-none focus:border-gold resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Milestones (one per line)
            </label>
            <textarea
              rows={3}
              value={gMilestonesText}
              onChange={(e) => setGMilestonesText(e.target.value)}
              placeholder="Milestone 1&#10;Milestone 2&#10;Milestone 3"
              className="w-full px-3.5 py-2 bg-surface border border-subtle rounded-lg text-sm text-main focus:outline-none focus:border-gold resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">
                Assigned Daily Tasks (comma-separated)
              </label>
              <input
                type="text"
                value={gLinkedTasks}
                onChange={(e) => setGLinkedTasks(e.target.value)}
                placeholder="Programming Practice, Mathematics"
                className="w-full px-3 py-2 bg-surface border border-subtle rounded-lg text-sm text-main focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Status</label>
              <select
                value={gStatus}
                onChange={(e) => setGStatus(e.target.value as Goal['status'])}
                className="w-full px-3 py-2 bg-surface border border-subtle rounded-lg text-sm text-main focus:outline-none focus:border-gold"
              >
                <option value="not_started">Not Started</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="paused">Paused</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Notes</label>
            <input
              type="text"
              value={gNotes}
              onChange={(e) => setGNotes(e.target.value)}
              className="w-full px-3.5 py-2 bg-surface border border-subtle rounded-lg text-sm text-main focus:outline-none focus:border-gold"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-subtle">
            <button
              type="button"
              onClick={() => setGoalModalOpen(false)}
              className="px-4 py-2 text-sm text-main bg-surface hover:border-gold-border border border-subtle rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-semibold text-on-gold bg-gold hover:bg-gold-hover rounded-lg transition-colors"
            >
              {editingGoal ? 'Save Goal' : 'Create Goal'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Project Modal */}
      <Modal
        open={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        title={editingProject ? 'Edit Project' : 'Add Technical or Creative Project'}
      >
        <form onSubmit={handleSaveProject} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Type</label>
              <select
                value={pType}
                onChange={(e) => setPType(e.target.value as Project['type'])}
                className="w-full px-3 py-2.5 bg-surface border border-subtle rounded-lg text-sm text-main focus:outline-none focus:border-gold"
              >
                <option value="technical">Technical</option>
                <option value="creative">Creative</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Status</label>
              <select
                value={pStatus}
                onChange={(e) => setPStatus(e.target.value as Project['status'])}
                className="w-full px-3 py-2.5 bg-surface border border-subtle rounded-lg text-sm text-main focus:outline-none focus:border-gold"
              >
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On Hold</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Deadline</label>
              <input
                type="date"
                value={pDeadline}
                onChange={(e) => setPDeadline(e.target.value)}
                className="w-full px-3 py-2.5 bg-surface border border-subtle rounded-lg text-sm font-mono tabular-nums text-main focus:outline-none focus:border-gold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Project Title</label>
            <input
              type="text"
              value={pTitle}
              onChange={(e) => setPTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-surface border border-subtle rounded-lg text-sm text-main focus:outline-none focus:border-gold"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Description</label>
            <textarea
              rows={2}
              value={pDesc}
              onChange={(e) => setPDesc(e.target.value)}
              className="w-full px-3.5 py-2 bg-surface border border-subtle rounded-lg text-sm text-main focus:outline-none focus:border-gold resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Project Tasks / Deliverables (one per line)
            </label>
            <textarea
              rows={3}
              value={pTasksText}
              onChange={(e) => setPTasksText(e.target.value)}
              className="w-full px-3.5 py-2 bg-surface border border-subtle rounded-lg text-sm text-main focus:outline-none focus:border-gold resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Notes</label>
            <input
              type="text"
              value={pNotes}
              onChange={(e) => setPNotes(e.target.value)}
              className="w-full px-3.5 py-2 bg-surface border border-subtle rounded-lg text-sm text-main focus:outline-none focus:border-gold"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-subtle">
            <button
              type="button"
              onClick={() => setProjectModalOpen(false)}
              className="px-4 py-2 text-sm text-main bg-surface hover:border-gold-border border border-subtle rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-semibold text-on-gold bg-gold hover:bg-gold-hover rounded-lg transition-colors"
            >
              {editingProject ? 'Save Project' : 'Create Project'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingGoal)}
        onClose={() => setDeletingGoal(null)}
        onConfirm={() => deletingGoal && onDeleteGoal(deletingGoal.id)}
        title="Delete Goal?"
        message={`Remove "${deletingGoal?.title}" permanently?`}
        confirmLabel="Delete Goal"
      />
      <ConfirmDialog
        open={Boolean(deletingProject)}
        onClose={() => setDeletingProject(null)}
        onConfirm={() => deletingProject && onDeleteProject(deletingProject.id)}
        title="Delete Project?"
        message={`Remove "${deletingProject?.title}" permanently?`}
        confirmLabel="Delete Project"
      />
    </div>
  );
}

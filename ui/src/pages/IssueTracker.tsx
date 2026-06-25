import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { authApi } from "../api/auth";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useDialog } from "../context/DialogContext";
import { queryKeys } from "../lib/queryKeys";
import { formatDate, cn } from "../lib/utils";
import { timeAgo } from "../lib/timeAgo";
import { StatusIcon } from "../components/StatusIcon";
import { PriorityIcon } from "../components/PriorityIcon";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  Search,
  Filter,
  ArrowUpDown,
  CircleDot,
  CheckCircle2,
  Clock,
  AlertTriangle,
  X,
  Tag,
  User,
  Calendar,
  MessageSquare,
  Trash2,
  Edit3,
  ChevronDown,
  List,
  LayoutGrid,
} from "lucide-react";
import type { Issue, IssueLabel } from "@paperclipai/shared";

/* ── Helpers ── */

const statusOrder = ["backlog", "todo", "in_progress", "in_review", "blocked", "done", "cancelled"];
const priorityOrder = ["critical", "high", "medium", "low"];

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function priorityLabel(priority: string): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

/* ── Issue Detail Drawer ── */

function IssueDetailDrawer({
  issue,
  open,
  onClose,
  onUpdate,
  onDelete,
  agents,
  labels,
}: {
  issue: Issue | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (id: string, data: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  agents: { id: string; name: string }[] | undefined;
  labels: IssueLabel[] | undefined;
}) {
  if (!issue) return null;

  const issueLabels = labels?.filter((l) => (issue as Issue & { labelIds?: string[] }).labelIds?.includes(l.id)) ?? [];
  const assigneeName = issue.assigneeAgentId
    ? agents?.find((a) => a.id === issue.assigneeAgentId)?.name ?? "Agent"
    : issue.assigneeUserId ?? "Unassigned";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono font-medium">{issue.identifier ?? issue.issueNumber ?? issue.id.slice(0, 8)}</span>
            <StatusIcon status={issue.status} showLabel />
            <PriorityIcon priority={issue.priority} showLabel />
          </div>
          <DialogTitle className="text-xl">{issue.title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {issue.description || "No description provided."}
            </p>
            <Separator />
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Assignee:</span>{" "}
                <span className="inline-flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {assigneeName}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Created:</span>{" "}
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDate(issue.createdAt)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Updated:</span>{" "}
                {timeAgo(issue.updatedAt)}
              </div>
              <div>
                <span className="text-muted-foreground">Project:</span>{" "}
                {(issue as Issue & { project?: { name: string } | null }).project?.name ?? "—"}
              </div>
            </div>
            {issueLabels.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {issueLabels.map((label) => (
                  <Badge key={label.id} variant="secondary" style={{ backgroundColor: label.color, color: "#fff" }}>
                    {label.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(issue.id)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Create Issue Dialog ── */

function CreateIssueDialog({
  open,
  onClose,
  onCreate,
  companyId,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: Record<string, unknown>) => void;
  companyId: string;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("medium");

  const handleSubmit = () => {
    if (!title.trim()) return;
    onCreate({
      title: title.trim(),
      description: description.trim(),
      status,
      priority,
      originKind: "manual",
    });
    setTitle("");
    setDescription("");
    setStatus("todo");
    setPriority("medium");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Issue</DialogTitle>
          <DialogDescription>Add a new issue to the tracker.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Issue title" />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue..."
              className="w-full min-h-[80px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOrder.map((s) => (
                    <SelectItem key={s} value={s}>
                      <span className="inline-flex items-center gap-2">
                        <StatusIcon status={s} /> {statusLabel(s)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Priority</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorityOrder.map((p) => (
                    <SelectItem key={p} value={p}>
                      <span className="inline-flex items-center gap-2">
                        <PriorityIcon priority={p} /> {priorityLabel(p)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim()}>
            Create Issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Main Page ── */

export function IssueTracker() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { openNewIssue } = useDialog();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [sortField, setSortField] = useState<"updated" | "priority" | "status" | "title" | "created">("updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailIssue, setDetailIssue] = useState<Issue | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: "Issue Tracker" }]);
  }, [setBreadcrumbs]);

  const { data: issues, isLoading, error } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: labels } = useQuery({
    queryKey: queryKeys.issues.labels(selectedCompanyId!),
    queryFn: () => issuesApi.listLabels(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: currentUser } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => issuesApi.create(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => issuesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
      if (detailIssue) {
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(detailIssue.id) });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => issuesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
      setDetailOpen(false);
      setDetailIssue(null);
    },
  });

  const filteredIssues = useMemo(() => {
    let result = [...(issues ?? [])];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          (i.description ?? "").toLowerCase().includes(q) ||
          (i.identifier ?? "").toLowerCase().includes(q) ||
          String(i.issueNumber ?? "").includes(q),
      );
    }

    if (statusFilter.length > 0) {
      result = result.filter((i) => statusFilter.includes(i.status));
    }
    if (priorityFilter.length > 0) {
      result = result.filter((i) => priorityFilter.includes(i.priority));
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === "updated") {
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      } else if (sortField === "created") {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortField === "priority") {
        cmp = priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
      } else if (sortField === "status") {
        cmp = statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
      } else if (sortField === "title") {
        cmp = a.title.localeCompare(b.title);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [issues, search, statusFilter, priorityFilter, sortField, sortDir]);

  const toggleFilter = <T extends string>(setter: React.Dispatch<React.SetStateAction<T[]>>, value: T) => {
    setter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      const trimmed = value.trim();
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (trimmed) next.set("q", trimmed);
        else next.delete("q");
        return next;
      });
    },
    [setSearchParams],
  );

  const openDetail = (issue: Issue) => {
    setDetailIssue(issue);
    setDetailOpen(true);
  };

  const activeFiltersCount = statusFilter.length + priorityFilter.length;

  if (!selectedCompanyId) {
    return <EmptyState icon={CircleDot} message="Select a company to view issues." />;
  }

  if (isLoading) {
    return <PageSkeleton />;
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        message={error instanceof Error ? error.message : "Failed to load issues"}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Issue Tracker</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {(issues ?? []).length} total issues, {filteredIssues.length} shown
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Issue
        </Button>
      </div>

      {/* Filters Bar */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        {/* Search + Sort */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search issues..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={`${sortField}:${sortDir}`}
            onValueChange={(v) => {
              const [field, dir] = v.split(":") as [typeof sortField, typeof sortDir];
              setSortField(field);
              setSortDir(dir);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated:desc">Last updated</SelectItem>
              <SelectItem value="updated:asc">Oldest updated</SelectItem>
              <SelectItem value="created:desc">Newest created</SelectItem>
              <SelectItem value="created:asc">Oldest created</SelectItem>
              <SelectItem value="priority:desc">Highest priority</SelectItem>
              <SelectItem value="priority:asc">Lowest priority</SelectItem>
              <SelectItem value="status:asc">Status</SelectItem>
              <SelectItem value="title:asc">Title A–Z</SelectItem>
              <SelectItem value="title:desc">Title Z–A</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Filter Chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Filter className="h-3 w-3" /> Status:
          </span>
          {statusOrder.map((s) => (
            <button
              key={s}
              onClick={() => toggleFilter(setStatusFilter, s)}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors",
                statusFilter.includes(s)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-accent/50",
              )}
            >
              <StatusIcon status={s} />
              {statusLabel(s)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Priority:
          </span>
          {priorityOrder.map((p) => (
            <button
              key={p}
              onClick={() => toggleFilter(setPriorityFilter, p)}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors",
                priorityFilter.includes(p)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-accent/50",
              )}
            >
              <PriorityIcon priority={p} />
              {priorityLabel(p)}
            </button>
          ))}
          {activeFiltersCount > 0 && (
            <button
              onClick={() => {
                setStatusFilter([]);
                setPriorityFilter([]);
              }}
              className="text-xs text-muted-foreground hover:text-foreground underline ml-2"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Issues Table */}
      {filteredIssues.length === 0 ? (
        <EmptyState icon={CircleDot} message="No issues match your filters." />
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-24">ID</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Title</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-28">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-28">Priority</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-36">Assignee</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-32">Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredIssues.map((issue) => {
                  const assigneeName = issue.assigneeAgentId
                    ? agents?.find((a) => a.id === issue.assigneeAgentId)?.name ?? "Agent"
                    : issue.assigneeUserId ?? "—";
                  const issueLabels =
                    labels?.filter((l) => (issue as Issue & { labelIds?: string[] }).labelIds?.includes(l.id)) ?? [];

                  return (
                    <tr
                      key={issue.id}
                      onClick={() => openDetail(issue)}
                      className="border-b border-border last:border-b-0 hover:bg-accent/30 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-muted-foreground">
                          {issue.identifier ?? `GEN-${issue.issueNumber ?? issue.id.slice(0, 6)}`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{issue.title}</div>
                        {issueLabels.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {issueLabels.slice(0, 3).map((label) => (
                              <span
                                key={label.id}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium"
                                style={{ backgroundColor: label.color + "20", color: label.color }}
                              >
                                <Tag className="h-2.5 w-2.5" />
                                {label.name}
                              </span>
                            ))}
                            {issueLabels.length > 3 && (
                              <span className="text-[10px] text-muted-foreground">+{issueLabels.length - 3}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusIcon status={issue.status} showLabel />
                      </td>
                      <td className="px-4 py-3">
                        <PriorityIcon priority={issue.priority} showLabel />
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <User className="h-3 w-3" />
                          {assigneeName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(issue.createdAt)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <CreateIssueDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(data) => createMutation.mutate(data)}
        companyId={selectedCompanyId}
      />
      <IssueDetailDrawer
        issue={detailIssue}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onUpdate={(id, data) => updateMutation.mutate({ id, data })}
        onDelete={(id) => deleteMutation.mutate(id)}
        agents={agents?.map((a) => ({ id: a.id, name: a.name }))}
        labels={labels}
      />
    </div>
  );
}

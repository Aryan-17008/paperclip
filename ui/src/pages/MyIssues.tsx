import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { issuesApi } from "../api/issues";
import { authApi } from "../api/auth";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
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
  AlertTriangle,
  X,
  User,
  Calendar,
  MessageSquare,
  Trash2,
  CheckCircle2,
  Clock,
  PenLine,
  Bug,
  Lightbulb,
  BarChart3,
} from "lucide-react";
import type { Issue } from "@paperclipai/shared";

/* ── Helpers ── */

const statusOrder = ["backlog", "todo", "in_progress", "in_review", "blocked", "done", "cancelled"];
const priorityOrder = ["critical", "high", "medium", "low"];

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function priorityLabel(priority: string): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

/* ── Stats Card ── */

function StatCard({ label, value, icon: Icon, tone = "default" }: { label: string; value: number; icon: React.ElementType; tone?: "default" | "success" | "warning" | "danger" }) {
  const toneClasses = {
    default: "bg-card border-border",
    success: "bg-emerald-500/10 border-emerald-500/30",
    warning: "bg-amber-500/10 border-amber-500/30",
    danger: "bg-red-500/10 border-red-500/30",
  };
  const iconClasses = {
    default: "text-muted-foreground",
    success: "text-emerald-500",
    warning: "text-amber-500",
    danger: "text-red-500",
  };
  return (
    <div className={cn("rounded-lg border p-3 flex items-center gap-3", toneClasses[tone])}>
      <Icon className={cn("h-5 w-5", iconClasses[tone])} />
      <div>
        <div className="text-xl font-semibold leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
      </div>
    </div>
  );
}

/* ── Issue Detail Drawer ── */

function IssueDetailDrawer({
  issue,
  open,
  onClose,
  onUpdate,
  onDelete,
}: {
  issue: Issue | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (id: string, data: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  if (!issue) return null;

  const assigneeName = issue.assigneeAgentId
    ? "Agent"
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
                <span className="text-muted-foreground">Origin:</span>{" "}
                <Badge variant="outline" className="text-xs">
                  {issue.originKind ?? "manual"}
                </Badge>
              </div>
            </div>
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
  const [issueType, setIssueType] = useState<"bug" | "feature" | "task">("task");

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
    setIssueType("task");
    onClose();
  };

  const typeConfig = {
    bug: { icon: Bug, label: "Bug Report", placeholder: "Describe the bug..." },
    feature: { icon: Lightbulb, label: "Feature Request", placeholder: "Describe the feature..." },
    task: { icon: PenLine, label: "Task", placeholder: "Describe the task..." },
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Report an Issue</DialogTitle>
          <DialogDescription>Track something you noticed in Paperclip.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            {( ["bug", "feature", "task"] as const).map((t) => {
              const { icon: Icon, label } = typeConfig[t];
              return (
                <button
                  key={t}
                  onClick={() => setIssueType(t)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors",
                    issueType === t
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-accent/50"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </div>
          <div>
            <label className="text-sm font-medium">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${typeConfig[issueType].label} title`} />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={typeConfig[issueType].placeholder}
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

export function MyIssues() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
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
    setBreadcrumbs([{ label: "My Issues" }]);
  }, [setBreadcrumbs]);

  const { data: myIssues, isLoading, error } = useQuery({
    queryKey: queryKeys.issues.listCreatedByMe(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!, { createdByUserId: "me" }),
    enabled: !!selectedCompanyId,
  });

  const { data: currentUser } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => issuesApi.create(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listCreatedByMe(selectedCompanyId!) });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => issuesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listCreatedByMe(selectedCompanyId!) });
      if (detailIssue) {
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(detailIssue.id) });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => issuesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listCreatedByMe(selectedCompanyId!) });
      setDetailOpen(false);
      setDetailIssue(null);
    },
  });

  const filteredIssues = useMemo(() => {
    let result = [...(myIssues ?? [])];

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
  }, [myIssues, search, statusFilter, priorityFilter, sortField, sortDir]);

  const stats = useMemo(() => {
    const all = myIssues ?? [];
    const open = all.filter((i) => !["done", "cancelled"].includes(i.status));
    const done = all.filter((i) => i.status === "done");
    const critical = all.filter((i) => i.priority === "critical" && !["done", "cancelled"].includes(i.status));
    return { total: all.length, open: open.length, done: done.length, critical: critical.length };
  }, [myIssues]);

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
    return <EmptyState icon={CircleDot} message="Select a company to view your issues." />;
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
          <h1 className="text-2xl font-semibold tracking-tight">My Issues</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Issues you raised in Paperclip — {stats.total} total
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Report Issue
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total" value={stats.total} icon={BarChart3} />
        <StatCard label="Open" value={stats.open} icon={Clock} tone="warning" />
        <StatCard label="Done" value={stats.done} icon={CheckCircle2} tone="success" />
        <StatCard label="Critical" value={stats.critical} icon={AlertTriangle} tone="danger" />
      </div>

      {/* Filters Bar */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        {/* Search + Sort */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search your issues..."
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
            <Filter className="h-3 w-3" /> Priority:
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
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-border text-muted-foreground hover:bg-accent/50 transition-colors"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Issue List */}
      {filteredIssues.length === 0 ? (
        <EmptyState
          icon={CircleDot}
          message={
            myIssues?.length === 0
              ? "You haven't raised any issues yet. Click 'Report Issue' to create one."
              : "No issues match your filters."
          }
        />
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="divide-y divide-border">
            {filteredIssues.map((issue) => (
              <button
                key={issue.id}
                onClick={() => openDetail(issue)}
                className="w-full text-left px-4 py-3 hover:bg-accent/40 transition-colors flex items-start gap-3"
              >
                <div className="mt-0.5 shrink-0">
                  <StatusIcon status={issue.status} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{issue.title}</span>
                    <PriorityIcon priority={issue.priority} />
                    {issue.originKind && issue.originKind !== "manual" && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1">
                        {issue.originKind}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="font-mono">{issue.identifier ?? `#${issue.issueNumber}`}</span>
                    <span>·</span>
                    <span>{timeAgo(issue.updatedAt)}</span>
                    {issue.assigneeAgentId || issue.assigneeUserId ? (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {issue.assigneeAgentId ? "Agent" : issue.assigneeUserId}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
              </button>
            ))}
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
      />
    </div>
  );
}

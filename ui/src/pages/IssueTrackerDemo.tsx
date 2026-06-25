import { useState, useMemo } from "react";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { StatusIcon } from "@/components/StatusIcon";
import { PriorityIcon } from "@/components/PriorityIcon";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { cn, formatDate } from "@/lib/utils";
import { timeAgo } from "@/lib/timeAgo";
import {
  Plus,
  Search,
  Filter,
  LayoutGrid,
  List,
  ArrowUpDown,
  CircleDot,
  CheckCircle2,
  Clock,
  AlertTriangle,
  X,
  ChevronDown,
  Tag,
  User,
  Calendar,
  MessageSquare,
  MoreHorizontal,
  Trash2,
  Edit3,
} from "lucide-react";

/* ── Types ── */

interface DemoIssue {
  id: string;
  identifier: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee: string | null;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  comments: number;
}

/* ── Mock Data ── */

const mockIssues: DemoIssue[] = [
  {
    id: "1",
    identifier: "DEMO-1",
    title: "Design new landing page hero section",
    description: "Create a modern, responsive hero section with animated gradients and CTA buttons.",
    status: "in_progress",
    priority: "high",
    assignee: "Alice Chen",
    labels: ["design", "frontend"],
    createdAt: "2026-05-28T10:00:00Z",
    updatedAt: "2026-06-01T08:30:00Z",
    comments: 3,
  },
  {
    id: "2",
    identifier: "DEMO-2",
    title: "Fix authentication token expiry bug",
    description: "Users are being logged out prematurely due to incorrect token refresh logic.",
    status: "todo",
    priority: "critical",
    assignee: "Bob Smith",
    labels: ["bug", "backend", "security"],
    createdAt: "2026-05-30T14:00:00Z",
    updatedAt: "2026-05-30T14:00:00Z",
    comments: 1,
  },
  {
    id: "3",
    identifier: "DEMO-3",
    title: "Implement dark mode toggle",
    description: "Add a theme switcher that persists user preference across sessions.",
    status: "backlog",
    priority: "medium",
    assignee: null,
    labels: ["feature", "ui"],
    createdAt: "2026-05-25T09:00:00Z",
    updatedAt: "2026-05-25T09:00:00Z",
    comments: 0,
  },
  {
    id: "4",
    identifier: "DEMO-4",
    title: "Optimize database query performance",
    description: "Slow queries on the dashboard are causing 3+ second load times. Add indexes.",
    status: "in_review",
    priority: "high",
    assignee: "Carol Jones",
    labels: ["performance", "backend"],
    createdAt: "2026-05-27T11:00:00Z",
    updatedAt: "2026-06-01T07:00:00Z",
    comments: 5,
  },
  {
    id: "5",
    identifier: "DEMO-5",
    title: "Write API documentation",
    description: "Document all REST endpoints with OpenAPI spec and example requests.",
    status: "done",
    priority: "low",
    assignee: "Dave Wilson",
    labels: ["docs"],
    createdAt: "2026-05-20T08:00:00Z",
    updatedAt: "2026-05-29T16:00:00Z",
    comments: 2,
  },
  {
    id: "6",
    identifier: "DEMO-6",
    title: "Set up CI/CD pipeline",
    description: "Configure GitHub Actions for automated testing and deployment.",
    status: "blocked",
    priority: "high",
    assignee: "Eve Brown",
    labels: ["devops", "infrastructure"],
    createdAt: "2026-05-22T13:00:00Z",
    updatedAt: "2026-05-31T10:00:00Z",
    comments: 4,
  },
  {
    id: "7",
    identifier: "DEMO-7",
    title: "Mobile responsive layout fixes",
    description: "Several pages break on screens smaller than 768px. Fix flexbox and grid layouts.",
    status: "todo",
    priority: "medium",
    assignee: "Alice Chen",
    labels: ["frontend", "mobile"],
    createdAt: "2026-06-01T09:00:00Z",
    updatedAt: "2026-06-01T09:00:00Z",
    comments: 0,
  },
];

const allLabels = ["design", "frontend", "backend", "bug", "feature", "security", "performance", "docs", "devops", "infrastructure", "ui", "mobile"];
const allAssignees = ["Alice Chen", "Bob Smith", "Carol Jones", "Dave Wilson", "Eve Brown"];

/* ── Helpers ── */

const statusOrder = ["backlog", "todo", "in_progress", "in_review", "blocked", "done", "cancelled"];
const priorityOrder = ["critical", "high", "medium", "low"];

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ── Components ── */

function IssueCreateDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (issue: Omit<DemoIssue, "id" | "identifier" | "createdAt" | "updatedAt" | "comments">) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("medium");
  const [assignee, setAssignee] = useState<string>("");
  const [labels, setLabels] = useState<string[]>([]);

  const handleSubmit = () => {
    if (!title.trim()) return;
    onCreate({ title: title.trim(), description: description.trim(), status, priority, assignee: assignee || null, labels });
    setTitle("");
    setDescription("");
    setStatus("todo");
    setPriority("medium");
    setAssignee("");
    setLabels([]);
    onClose();
  };

  const toggleLabel = (label: string) => {
    setLabels((prev) => prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]);
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
                <SelectTrigger><SelectValue /></SelectTrigger>
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
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {priorityOrder.map((p) => (
                    <SelectItem key={p} value={p}>
                      <span className="inline-flex items-center gap-2">
                        <PriorityIcon priority={p} /> {p.charAt(0).toUpperCase() + p.slice(1)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Assignee</label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
                {allAssignees.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Labels</label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {allLabels.map((label) => (
                <button
                  key={label}
                  onClick={() => toggleLabel(label)}
                  className={cn(
                    "px-2 py-0.5 rounded-full text-xs border transition-colors",
                    labels.includes(label)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-accent/50"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!title.trim()}>Create Issue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IssueDetailDialog({ issue, open, onClose, onUpdate, onDelete }: {
  issue: DemoIssue | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<DemoIssue>) => void;
  onDelete: (id: string) => void;
}) {
  if (!issue) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono">{issue.identifier}</span>
            <StatusIcon status={issue.status} showLabel />
            <PriorityIcon priority={issue.priority} showLabel />
          </div>
          <DialogTitle className="text-xl">{issue.title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            <p className="text-sm text-foreground whitespace-pre-wrap">{issue.description || "No description provided."}</p>
            <Separator />
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Assignee:</span>{" "}
                {issue.assignee ? (
                  <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{issue.assignee}</span>
                ) : (
                  <span className="text-muted-foreground">Unassigned</span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Created:</span>{" "}
                {formatDate(issue.createdAt)}
              </div>
              <div>
                <span className="text-muted-foreground">Updated:</span>{" "}
                {timeAgo(issue.updatedAt)}
              </div>
              <div>
                <span className="text-muted-foreground">Comments:</span>{" "}
                <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{issue.comments}</span>
              </div>
            </div>
            {issue.labels.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {issue.labels.map((label) => (
                  <Badge key={label} variant="secondary">{label}</Badge>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onDelete(issue.id)} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Main Page ── */

export function IssueTrackerDemo() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [issues, setIssues] = useState<DemoIssue[]>(mockIssues);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
  const [labelFilter, setLabelFilter] = useState<string[]>([]);
  const [sortField, setSortField] = useState<"updated" | "priority" | "status" | "title">("updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailIssue, setDetailIssue] = useState<DemoIssue | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useState(() => {
    setBreadcrumbs([{ label: "Issue Tracker Demo" }]);
  });

  const filteredIssues = useMemo(() => {
    let result = [...issues];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((i) =>
        i.title.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.identifier.toLowerCase().includes(q)
      );
    }

    if (statusFilter.length > 0) {
      result = result.filter((i) => statusFilter.includes(i.status));
    }
    if (priorityFilter.length > 0) {
      result = result.filter((i) => priorityFilter.includes(i.priority));
    }
    if (assigneeFilter.length > 0) {
      result = result.filter((i) => assigneeFilter.includes(i.assignee ?? ""));
    }
    if (labelFilter.length > 0) {
      result = result.filter((i) => labelFilter.some((l) => i.labels.includes(l)));
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === "updated") {
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
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
  }, [issues, search, statusFilter, priorityFilter, assigneeFilter, labelFilter, sortField, sortDir]);

  const groupedByStatus = useMemo(() => {
    const groups: Record<string, DemoIssue[]> = {};
    for (const status of statusOrder) {
      groups[status] = filteredIssues.filter((i) => i.status === status);
    }
    return groups;
  }, [filteredIssues]);

  const toggleFilter = <T extends string>(setter: React.Dispatch<React.SetStateAction<T[]>>, value: T) => {
    setter((prev) => prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]);
  };

  const handleCreate = (data: Omit<DemoIssue, "id" | "identifier" | "createdAt" | "updatedAt" | "comments">) => {
    const nextNum = issues.length + 1;
    const newIssue: DemoIssue = {
      ...data,
      id: String(nextNum),
      identifier: `DEMO-${nextNum}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      comments: 0,
    };
    setIssues((prev) => [newIssue, ...prev]);
  };

  const handleUpdate = (id: string, data: Partial<DemoIssue>) => {
    setIssues((prev) => prev.map((i) => (i.id === id ? { ...i, ...data, updatedAt: new Date().toISOString() } : i)));
  };

  const handleDelete = (id: string) => {
    setIssues((prev) => prev.filter((i) => i.id !== id));
    setDetailOpen(false);
  };

  const openDetail = (issue: DemoIssue) => {
    setDetailIssue(issue);
    setDetailOpen(true);
  };

  const activeFiltersCount = statusFilter.length + priorityFilter.length + assigneeFilter.length + labelFilter.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Issue Tracker</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and track issues across your projects — {issues.length} total, {filteredIssues.length} shown
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Issue
        </Button>
      </div>

      {/* Filters Bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col gap-3">
            {/* Search + View Toggle */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search issues..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center border rounded-md">
                <button
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "p-2 transition-colors",
                    viewMode === "list" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode("board")}
                  className={cn(
                    "p-2 transition-colors",
                    viewMode === "board" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Filter Chips */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</span>
              {statusOrder.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleFilter(setStatusFilter, s)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border transition-colors",
                    statusFilter.includes(s)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-accent/50"
                  )}
                >
                  <StatusIcon status={s} className="h-3 w-3" />
                  {statusLabel(s)}
                </button>
              ))}

              <Separator orientation="vertical" className="h-4 mx-1" />

              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Priority</span>
              {priorityOrder.map((p) => (
                <button
                  key={p}
                  onClick={() => toggleFilter(setPriorityFilter, p)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border transition-colors",
                    priorityFilter.includes(p)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-accent/50"
                  )}
                >
                  <PriorityIcon priority={p} className="h-3 w-3" />
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}

              {activeFiltersCount > 0 && (
                <button
                  onClick={() => { setStatusFilter([]); setPriorityFilter([]); setAssigneeFilter([]); setLabelFilter([]); }}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      {viewMode === "list" ? (
        <Card>
          <CardContent className="p-0">
            {filteredIssues.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CircleDot className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No issues found</h3>
                <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters or create a new issue.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredIssues.map((issue) => (
                  <div
                    key={issue.id}
                    onClick={() => openDetail(issue)}
                    className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors group"
                  >
                    <StatusIcon status={issue.status} className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground shrink-0">{issue.identifier}</span>
                        <span className="text-sm font-medium truncate">{issue.title}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <PriorityIcon priority={issue.priority} showLabel />
                        {issue.assignee && (
                          <span className="inline-flex items-center gap-1">
                            <User className="h-3 w-3" />{issue.assignee}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />{issue.comments}
                        </span>
                        <span>{timeAgo(issue.updatedAt)}</span>
                      </div>
                      {issue.labels.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {issue.labels.map((label) => (
                            <Badge key={label} variant="secondary" className="text-[10px] px-1.5 py-0">{label}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={(e) => { e.stopPropagation(); openDetail(issue); }}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Board View */
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {statusOrder.map((status) => {
            const statusIssues = groupedByStatus[status] ?? [];
            return (
              <div key={status} className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-1.5">
                    <StatusIcon status={status} />
                    <span className="text-sm font-medium">{statusLabel(status)}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">{statusIssues.length}</Badge>
                </div>
                <div className="flex flex-col gap-2">
                  {statusIssues.map((issue) => (
                    <Card
                      key={issue.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => openDetail(issue)}
                    >
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono text-muted-foreground">{issue.identifier}</span>
                          <PriorityIcon priority={issue.priority} className="h-3 w-3" />
                        </div>
                        <p className="text-sm font-medium line-clamp-2">{issue.title}</p>
                        {issue.assignee && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />{issue.assignee}
                          </div>
                        )}
                        {issue.labels.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {issue.labels.slice(0, 2).map((label) => (
                              <Badge key={label} variant="secondary" className="text-[10px] px-1 py-0">{label}</Badge>
                            ))}
                            {issue.labels.length > 2 && (
                              <Badge variant="secondary" className="text-[10px] px-1 py-0">+{issue.labels.length - 2}</Badge>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <IssueCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
      <IssueDetailDialog
        issue={detailIssue}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />
    </div>
  );
}

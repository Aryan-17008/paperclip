import { useMemo } from "react";
import {
  Bot,
  Code2,
  Palette,
  Shield,
  TrendingUp,
  Bug,
  Lightbulb,
  RefreshCw,
  Wand2,
  MessageSquare,
  TestTube,
  Server,
  Database,
  Layout,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentAvatarProps {
  role: string;
  name: string;
  status?: string;
  size?: "sm" | "md" | "lg";
  showStatus?: boolean;
}

const roleIcons: Record<string, React.ElementType> = {
  ceo: TrendingUp,
  cmo: MessageSquare,
  engineer: Code2,
  frontend_engineer: Palette,
  backend_engineer: Server,
  security: Shield,
  qa: TestTube,
  qa_tester: Bug,
  designer: Layout,
  pm: Lightbulb,
  devops: RefreshCw,
  data_engineer: Database,
  ml_engineer: Cpu,
  default: Wand2,
};

const roleColors: Record<string, string> = {
  ceo: "bg-amber-500/20 text-amber-600",
  cmo: "bg-pink-500/20 text-pink-600",
  engineer: "bg-blue-500/20 text-blue-600",
  frontend_engineer: "bg-purple-500/20 text-purple-600",
  backend_engineer: "bg-green-500/20 text-green-600",
  security: "bg-red-500/20 text-red-600",
  qa: "bg-orange-500/20 text-orange-600",
  qa_tester: "bg-yellow-500/20 text-yellow-600",
  designer: "bg-indigo-500/20 text-indigo-600",
  pm: "bg-teal-500/20 text-teal-600",
  devops: "bg-cyan-500/20 text-cyan-600",
  data_engineer: "bg-emerald-500/20 text-emerald-600",
  ml_engineer: "bg-violet-500/20 text-violet-600",
  default: "bg-gray-500/20 text-gray-600",
};

const sizeClasses = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-10 w-10",
};

const iconSizes = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export function AgentAvatar({ role, name, status, size = "md", showStatus = true }: AgentAvatarProps) {
  const Icon = roleIcons[role] || roleIcons.default;
  const colorClass = roleColors[role] || roleColors.default;

  const statusDot = useMemo(() => {
    if (!showStatus || !status) return null;
    const statusColors: Record<string, string> = {
      active: "bg-green-500",
      idle: "bg-blue-500",
      paused: "bg-yellow-500",
      error: "bg-red-500",
    };
    return (
      <span
        className={cn(
          "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background",
          statusColors[status] || "bg-gray-500"
        )}
        title={`Status: ${status}`}
      />
    );
  }, [status, showStatus]);

  return (
    <div className="relative inline-flex">
      <div
        className={cn(
          "flex items-center justify-center rounded-full",
          sizeClasses[size],
          colorClass
        )}
        title={name}
      >
        <Icon className={iconSizes[size]} />
      </div>
      {statusDot}
    </div>
  );
}

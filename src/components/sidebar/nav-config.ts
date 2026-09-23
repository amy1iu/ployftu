import {
  BookOpen,
  Database,
  FileText,
  Globe,
  Image,
  LayoutDashboard,
  MessageSquare,
  Plus,
  Puzzle,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { id: string; label: string; icon: LucideIcon };

export const primaryNav: NavItem[] = [
  { id: "new-ploy", label: "New Ploy", icon: Plus },
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "ploys", label: "Ploys", icon: MessageSquare },
  { id: "sites", label: "Sites", icon: Globe },
];

export const libraryNav: NavItem[] = [
  { id: "assets", label: "Assets", icon: Image },
  { id: "docs", label: "Docs", icon: FileText },
  { id: "ploybooks", label: "Ploybooks", icon: BookOpen },
  { id: "integrations", label: "Integrations", icon: Puzzle },
  { id: "databases", label: "Databases", icon: Database },
];

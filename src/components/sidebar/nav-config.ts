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

// Items without an href are mocked: they render but don't navigate yet.
export type NavItem = { id: string; label: string; icon: LucideIcon; href?: string };

export const primaryNav: NavItem[] = [
  { id: "new-ploy", label: "New Ploy", icon: Plus },
  { id: "overview", label: "Overview", icon: LayoutDashboard, href: "/overview" },
  { id: "ploys", label: "Ploys", icon: MessageSquare },
  { id: "sites", label: "Sites", icon: Globe },
];

export const libraryNav: NavItem[] = [
  { id: "assets", label: "Assets", icon: Image },
  { id: "docs", label: "Docs", icon: FileText, href: "/docs" },
  { id: "ploybooks", label: "Ploybooks", icon: BookOpen },
  { id: "integrations", label: "Integrations", icon: Puzzle },
  { id: "databases", label: "Databases", icon: Database },
];

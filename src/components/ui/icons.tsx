/**
 * Icons are Lucide, 20px, 1.75 stroke, in the current text colour.
 * Re-exported here so the rest of the app has one import path.
 */
export {
  Phone,
  PhoneMissed,
  Mail,
  MessageSquare,
  Wrench,
  TrendingDown,
  Star,
  ClipboardList,
  Users,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  Clock,
  Search,
  Plus,
  X,
  Bell,
  Settings,
  StickyNote,
  Home,
} from "lucide-react";

import { Mail, MessageSquare, Phone, PhoneMissed, Star, TrendingDown, Wrench } from "lucide-react";
import type { Channel, LoopType } from "@/lib/domain/types";

export function LoopTypeIcon({ type, className = "h-5 w-5" }: { type: LoopType; className?: string }) {
  const props = { className, strokeWidth: 1.75, "aria-hidden": true as const };
  switch (type) {
    case "email":
      return <Mail {...props} />;
    case "missed_call":
      return <PhoneMissed {...props} />;
    case "sms":
      return <MessageSquare {...props} />;
    case "maintenance":
      return <Wrench {...props} />;
    case "detractor":
      return <Star {...props} />;
    case "resly":
      return <TrendingDown {...props} />;
  }
}

export function ChannelIcon({ channel, className = "h-5 w-5" }: { channel: Channel; className?: string }) {
  const props = { className, strokeWidth: 1.75, "aria-hidden": true as const };
  switch (channel) {
    case "email":
      return <Mail {...props} />;
    case "call":
      return <Phone {...props} />;
    case "sms":
      return <MessageSquare {...props} />;
    case "maintenance":
      return <Wrench {...props} />;
    case "nps":
      return <Star {...props} />;
    case "resly":
      return <TrendingDown {...props} />;
    default:
      return <MessageSquare {...props} />;
  }
}

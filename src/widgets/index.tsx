import React from "react";
import { AlarmClock, CalendarDays, CheckSquare, Gavel, Inbox, NotebookPen, Sparkles, SplitSquareHorizontal, Video } from "lucide-react";
import type { WidgetType } from "../types";
import { AllMail, Agenda, Brief, Conflicts, Meet, Notes, Tasks, TendersW, TimeSplit, type WidgetProps } from "./tools";
import { InstagramApp, LinkedInApp, MailApp, OneDriveApp, SalesforceApp, SlackApp, TeamsApp, ZoomApp } from "./apps";

export const WIDGET_COMPONENTS: Record<WidgetType, React.FC<WidgetProps>> = {
  brief: Brief, agenda: Agenda, conflicts: Conflicts, inbox: AllMail, tasks: Tasks, timesplit: TimeSplit,
  notes: Notes, tenders: TendersW, meet: Meet,
  mail: MailApp, salesforce: SalesforceApp, teams: TeamsApp, zoom: ZoomApp, linkedin: LinkedInApp,
  instagram: InstagramApp, onedrive: OneDriveApp, slack: SlackApp,
};

export const TOOL_ICONS: Partial<Record<WidgetType, React.ReactNode>> = {
  brief: <Sparkles size={16} />, agenda: <CalendarDays size={16} />, conflicts: <AlarmClock size={16} />, inbox: <Inbox size={16} />,
  tasks: <CheckSquare size={16} />, timesplit: <SplitSquareHorizontal size={16} />, notes: <NotebookPen size={16} />,
  tenders: <Gavel size={16} />, meet: <Video size={16} />,
};

export { ConnectState } from "./apps";

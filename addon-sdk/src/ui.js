/**
 * @sxpanel/addon-sdk/ui
 *
 * Re-exports sxPanel's shadcn/ui components for use in addon panel bundles.
 * Addon bundlers should mark this as an external — the host panel provides
 * these components at runtime via the SxPanelUI global.
 *
 * This file serves as the runtime entry point. The actual components come from
 * the SxPanelUI global object set by the panel host.
 */

const ui = typeof globalThis !== 'undefined' && globalThis.SxPanelUI ? globalThis.SxPanelUI : {};

export const Button = ui.Button;
export const Card = ui.Card;
export const CardHeader = ui.CardHeader;
export const CardContent = ui.CardContent;
export const CardFooter = ui.CardFooter;
export const Badge = ui.Badge;
export const Input = ui.Input;
export const Textarea = ui.Textarea;
export const Select = ui.Select;
export const SelectItem = ui.SelectItem;
export const Dialog = ui.Dialog;
export const DialogHeader = ui.DialogHeader;
export const DialogContent = ui.DialogContent;
export const DialogFooter = ui.DialogFooter;
export const Table = ui.Table;
export const TableHeader = ui.TableHeader;
export const TableRow = ui.TableRow;
export const TableCell = ui.TableCell;
export const Tabs = ui.Tabs;
export const TabsList = ui.TabsList;
export const TabsTrigger = ui.TabsTrigger;
export const TabsContent = ui.TabsContent;
export const Alert = ui.Alert;
export const AlertTitle = ui.AlertTitle;
export const AlertDescription = ui.AlertDescription;
export const Tooltip = ui.Tooltip;
export const Skeleton = ui.Skeleton;
export const ScrollArea = ui.ScrollArea;
export const Separator = ui.Separator;

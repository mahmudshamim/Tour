"use client";

import { useUI } from "../ui";
import ExpenseSheet from "./ExpenseSheet";
import DetailSheet from "./DetailSheet";
import TransactionsSheet from "./TransactionsSheet";
import ActivityLogSheet from "./ActivityLogSheet";
import SettingsSheet from "./SettingsSheet";

export default function SheetHost() {
  const { sheet } = useUI();
  switch (sheet.kind) {
    case "add":
      return <ExpenseSheet />;
    case "edit":
      return <ExpenseSheet editing={sheet.txn} />;
    case "detail":
      return <DetailSheet txn={sheet.txn} />;
    case "transactions":
      return <TransactionsSheet />;
    case "log":
      return <ActivityLogSheet />;
    case "settings":
      return <SettingsSheet />;
    default:
      return null;
  }
}

"use client";

import { useState } from "react";
import { Check, Users, Settings2, User } from "lucide-react";
import { CATEGORIES, type CategoryId } from "../constants";
import { useStore, type Txn } from "../store";
import { useUI } from "../ui";
import type { TxnKind } from "../models";

export default function ExpenseSheet({ editing }: { editing?: Txn }) {
  const { state, addTxn, updateTxn } = useStore();
  const { close, openSettings } = useUI();
  const members = state.members;
  const symbol = state.settings.currency || "৳";

  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [cat, setCat] = useState<CategoryId>(editing?.category ?? "food");
  const [kind, setKind] = useState<TxnKind>(editing?.kind ?? "group");
  const [split, setSplit] = useState<string[]>(
    editing?.kind === "group" && editing.split.length
      ? editing.split
      : members.map((m) => m.id)
  );
  const [member, setMember] = useState<string>(
    editing?.member || state.settings.selfId || members[0]?.id || ""
  );

  const toggleSplit = (id: string) =>
    setSplit((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const amt = parseFloat(amount);
  const valid =
    !isNaN(amt) &&
    amt > 0 &&
    title.trim() &&
    (kind === "group" ? split.length > 0 : Boolean(member));

  const submit = () => {
    if (!valid) return;
    const data = {
      title: title.trim(),
      amount: Math.round(amt * 100) / 100,
      category: cat,
      kind,
      split: kind === "group" ? split : [],
      member: kind === "personal" ? member : "",
    };
    if (editing) updateTxn(editing.id, data);
    else addTxn(data);
    close();
  };

  if (members.length === 0) {
    return (
      <div className="sheet-overlay" onClick={close}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-grip" />
          <h2>Add Expense</h2>
          <div className="empty">
            <Users size={28} />
            <p>Add people (with their deposit) first, then log expenses.</p>
            <button className="btn-primary" onClick={openSettings}>
              <Settings2 size={17} /> Add people
            </button>
          </div>
        </div>
      </div>
    );
  }

  const perHead =
    kind === "group" && valid && split.length
      ? (amt / split.length).toFixed(2)
      : "0.00";

  return (
    <div className="sheet-overlay" onClick={close}>
      <div className="sheet tall" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <h2>{editing ? "Edit Expense" : "Add Expense"}</h2>

        <div className="field">
          <div className="input">
            <span className="cur">{symbol}</span>
            <input
              placeholder="0.00"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="field">
          <div className="input">
            <input
              placeholder="What was it for?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>

        <div className="cat-row">
          {CATEGORIES.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`cat ${cat === id ? "on" : ""}`}
              onClick={() => setCat(id)}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
        </div>

        {/* Group vs Personal */}
        <div className="seg">
          <button
            className={`seg-btn ${kind === "group" ? "on" : ""}`}
            onClick={() => setKind("group")}
          >
            <Users size={16} /> Group
          </button>
          <button
            className={`seg-btn ${kind === "personal" ? "on" : ""}`}
            onClick={() => setKind("personal")}
          >
            <User size={16} /> Personal
          </button>
        </div>

        {kind === "group" ? (
          <>
            <div className="split-title">
              Deduct from{" "}
              <span className="muted-inline">
                {symbol}
                {perHead} each
              </span>
            </div>
            {members.map((m) => (
              <div className="split-row" key={m.id}>
                <span className="m-avatar" style={{ background: m.color }}>
                  {m.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="nm">{m.name}</span>
                <button
                  className={`check ${split.includes(m.id) ? "on" : ""}`}
                  onClick={() => toggleSplit(m.id)}
                  aria-label={`Split with ${m.name}`}
                >
                  {split.includes(m.id) && <Check size={15} strokeWidth={3} />}
                </button>
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="split-title">Charge to one person</div>
            <div className="chip-row">
              {members.map((m) => (
                <button
                  key={m.id}
                  className={`pay-chip ${member === m.id ? "on" : ""}`}
                  onClick={() => setMember(m.id)}
                >
                  <span className="dot-avatar" style={{ background: m.color }} />
                  {m.name}
                </button>
              ))}
            </div>
          </>
        )}

        <button
          className="btn-primary"
          onClick={submit}
          disabled={!valid}
          style={{ opacity: valid ? 1 : 0.5 }}
        >
          {editing ? "Save Changes" : "Add Expense"}
        </button>
      </div>
    </div>
  );
}

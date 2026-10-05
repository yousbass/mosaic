import React, { useState } from "react";
import { ShieldCheck, Trash2 } from "lucide-react";
import { useStore } from "../store";
import { AppMono, Modal, useT } from "../ui";
import { removalCounts, removeAccounts } from "../lib/accounts";
import { isLive, openPermissions } from "../lib/live";

/** Confirm removing one or more accounts, and choose whether their data goes too. Undo is offered afterwards. */
export function RemoveAccountDialog({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone?: () => void }) {
  const { s, update } = useStore();
  const t = useT();
  const accs = s.connections.filter((c) => ids.includes(c.id));
  const n = removalCounts(s, ids);
  const live = accs.filter(isLive);
  const parts = [
    n.emails && t(`${n.emails} emails`, `${n.emails} رسالة`),
    n.chats && t(`${n.chats} chats`, `${n.chats} محادثة`),
    n.posts && t(`${n.posts} posts`, `${n.posts} منشور`),
    n.events && t(`${n.events} calendar events`, `${n.events} حدثًا في التقويم`),
    n.files && t(`${n.files} files`, `${n.files} ملفًا`),
    n.deals && t(`${n.deals} Salesforce opportunities`, `${n.deals} فرصة في Salesforce`),
    n.crmTasks && t(`${n.crmTasks} Salesforce tasks`, `${n.crmTasks} مهمة في Salesforce`),
  ].filter(Boolean) as string[];
  const [deleteData, setDeleteData] = useState(parts.length > 0);
  const [permNote, setPermNote] = useState("");
  if (!accs.length) return null;
  const one = accs.length === 1 ? accs[0] : undefined;
  const title = one ? t(`Remove ${one.label}?`, `إزالة ${one.label}؟`) : t(`Remove ${accs.length} accounts?`, `إزالة ${accs.length} حسابات؟`);

  const confirm = () => {
    const label = one ? t(`${one.label} removed`, `أُزيل ${one.label}`) : t(`${accs.length} accounts removed`, `أُزيلت ${accs.length} حسابات`);
    update((st) => removeAccounts(st, ids, deleteData), label);
    onClose();
    onDone?.();
  };

  return (
    <Modal title={title} onClose={onClose} labelId="remove-title"
      foot={<>
        <div className="grow" />
        <button className="btn ghost" onClick={onClose}>{t("Cancel", "إلغاء")}</button>
        <button className="btn danger-fill" onClick={confirm}><Trash2 size={15} />{one ? t("Remove account", "أزل الحساب") : t(`Remove ${accs.length} accounts`, `أزل ${accs.length} حسابات`)}</button>
      </>}>
      {one ? (
        <div className="row" style={{ gap: 12, flexWrap: "nowrap" }}>
          <AppMono connectorId={one.connectorId} size="lg" />
          <div className="li-main"><b dir="auto">{one.label}</b><div className="small muted" dir="ltr" style={{ textAlign: "start" }}>{one.account || (isLive(one) ? one.server : "")}</div></div>
        </div>
      ) : (
        <div className="remove-list">{accs.map((a) => <span key={a.id} className="acct-pill static"><AppMono connectorId={a.connectorId} size="sm" /><span dir="auto">{a.label}</span></span>)}</div>
      )}
      <p className="small">{t("It's removed from Mosaic, and any card that showed it goes back to “Connect”. Drafts you wrote stay.",
        "يُزال من Mosaic، وتعود أي بطاقة كانت تعرضه إلى «اربط». تبقى المسودات التي كتبتها.")}</p>
      {parts.length > 0 && (
        <label className="check-row">
          <input id="rm-data" type="checkbox" checked={deleteData} onChange={(e) => setDeleteData(e.target.checked)} />
          <span><b>{t("Also delete what it brought into Mosaic", "احذف أيضًا ما جلبه إلى Mosaic")}</b>
            <span className="small muted" style={{ display: "block" }}>{parts.join(" · ")}</span></span>
        </label>
      )}
      {live.length > 0 && (
        <div className="banner live-banner">
          <ShieldCheck size={18} />
          <div className="stack" style={{ gap: 6 }}>
            <span className="small">{t(`Mosaic doesn't keep copies of your ${live[0].server} data, so nothing else is stored here. ${live[0].server} stays connected to your claude.ai account. To stop Mosaic using it at all, turn it off in this page's permissions.`,
              `لا يحتفظ Mosaic بنسخ من بيانات ${live[0].server}. يبقى ${live[0].server} مربوطًا بحسابك على claude.ai. لإيقاف استخدام Mosaic له تمامًا، أوقفه من أذونات الصفحة.`)}</span>
            <div><button className="btn sm" onClick={async () => { if (!(await openPermissions())) setPermNote(t("Open the page's Permissions menu at the top of this view.", "افتح قائمة الأذونات في أعلى هذه الصفحة.")); }}>{t("Open permissions", "افتح الأذونات")}</button></div>
            {permNote && <span className="tiny muted">{permNote}</span>}
          </div>
        </div>
      )}
      <p className="tiny faint">{t("You can undo this right after.", "يمكنك التراجع عن ذلك مباشرة بعدها.")}</p>
    </Modal>
  );
}

import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Popup } from "../../components/Popup";
import type { WorkbookController } from "../controller";
import { useCtl } from "../hooks";
import { HomeTab } from "./HomeTab";
import { KeyTips } from "./KeyTips";
import { DataTab, FormulasTab, HelpTab, InsertTab, PageLayoutTab, ReviewTab, ViewTab } from "./OtherTabs";

const TABS = ["Home", "Insert", "Page Layout", "Formulas", "Data", "Review", "View", "Help"] as const;
type Tab = (typeof TABS)[number];

export function Ribbon({ ctl, onFile }: { ctl: WorkbookController; onFile: () => void }) {
  const [tab, setTab] = useState<Tab>("Home");
  const collapsed = useCtl(ctl, (c) => c.ribbonCollapsed);
  const [peek, setPeek] = useState(false);
  const [share, setShare] = useState<DOMRect | null>(null);
  const keyTips = useCtl(ctl, (c) => c.keyTips);

  const content = (
    <div className="ribbon-content" onMouseDown={(e) => e.preventDefault()}>
      <div className="ribbon-groups">
        {tab === "Home" && <HomeTab ctl={ctl} />}
        {tab === "Insert" && <InsertTab ctl={ctl} />}
        {tab === "Page Layout" && <PageLayoutTab ctl={ctl} />}
        {tab === "Formulas" && <FormulasTab ctl={ctl} />}
        {tab === "Data" && <DataTab ctl={ctl} />}
        {tab === "Review" && <ReviewTab ctl={ctl} />}
        {tab === "View" && <ViewTab ctl={ctl} />}
        {tab === "Help" && <HelpTab ctl={ctl} />}
      </div>
      <button
        className="ribbon-collapse"
        title={collapsed ? "Pin the ribbon" : "Collapse the Ribbon (Ctrl+F1)"}
        onClick={() => {
          ctl.ribbonCollapsed = !collapsed;
          setPeek(false);
          ctl.emit();
        }}
      >
        <Icon name={collapsed ? "pin" : "chevronUp"} size={12} />
      </button>
    </div>
  );

  return (
    <div className={`ribbon ${collapsed ? "collapsed" : ""}`}>
      <div className="ribbon-tabs">
        <button className="ribbon-tab file-tab" onClick={onFile}>
          File
        </button>
        {TABS.map((t) => (
          <button
            key={t}
            className={`ribbon-tab ${t === tab && (!collapsed || peek) ? "active" : ""}`}
            onClick={() => {
              setTab(t);
              if (collapsed) setPeek(!(peek && t === tab));
            }}
            onDoubleClick={() => {
              ctl.ribbonCollapsed = !collapsed;
              setPeek(false);
              ctl.emit();
            }}
          >
            {t}
          </button>
        ))}
        <div className="ribbon-tabs-spacer" />
        <button className="share-btn" onClick={(e) => setShare(e.currentTarget.getBoundingClientRect())}>
          <Icon name="share" size={14} />
          Share
          <Icon name="chevronDown" size={10} />
        </button>
        {share && (
          <Popup anchor={share} placement="bottom-end" onClose={() => setShare(null)}>
            <div className="menu flyout share-panel">
              <div className="share-title">Share</div>
              <p>Sharing and co-authoring will be available once workbooks are stored in the database.</p>
              <p className="muted">For now, save the file (.xlsx) and share it as usual.</p>
            </div>
          </Popup>
        )}
      </div>
      <KeyTips
        ctl={ctl}
        tab={tab}
        onTab={(t) => {
          setTab(t as Tab);
          if (collapsed) setPeek(true);
        }}
        onFile={onFile}
      />
      {(!collapsed || peek || keyTips === "controls") && (
        <div className={peek ? "ribbon-peek" : ""} onMouseLeave={() => peek && setPeek(false)}>
          {content}
        </div>
      )}
    </div>
  );
}

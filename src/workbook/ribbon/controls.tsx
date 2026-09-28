import { useEffect, useRef, useState, type ReactNode } from "react";
import { ColorPicker } from "../../components/ColorPicker";
import { Icon } from "../../components/Icon";
import { MenuList, type MenuItem } from "../../components/Menu";
import { Popup } from "../../components/Popup";

/** Dropdown state that ignores the click that closed it (toggle behaviour). */
function useDropdown() {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const closedAt = useRef(0);
  const open = (el: HTMLElement) => {
    if (Date.now() - closedAt.current < 250) return;
    setAnchor(el.getBoundingClientRect());
  };
  const close = () => {
    closedAt.current = Date.now();
    setAnchor(null);
  };
  return { anchor, open, close };
}

type DropdownContent = MenuItem[] | ((close: () => void) => ReactNode);

function DropdownLayer({ anchor, content, close, large }: { anchor: DOMRect; content: DropdownContent; close: () => void; large?: boolean }) {
  return (
    <Popup anchor={anchor} onClose={close}>
      {Array.isArray(content) ? <MenuList items={content} onClose={close} large={large} /> : <div className="menu flyout">{content(close)}</div>}
    </Popup>
  );
}

export function RibbonGroup({ label, children, launcher, className }: { label: string; children: ReactNode; launcher?: () => void; className?: string }) {
  return (
    <div className={`rb-group ${className ?? ""}`}>
      <div className="rb-group-body">{children}</div>
      <div className="rb-group-label">
        <span>{label}</span>
        {launcher && (
          <button className="rb-launcher" title={`${label} Settings`} onClick={launcher} tabIndex={-1}>
            <svg width="9" height="9" viewBox="0 0 9 9">
              <path d="M0.5 0.5h5M0.5 0.5v5M3 3l5 5M8 4.5V8H4.5" stroke="currentColor" fill="none" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export function Stack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`rb-stack ${className ?? ""}`}>{children}</div>;
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`rb-row ${className ?? ""}`}>{children}</div>;
}

export function Sep() {
  return <div className="rb-vsep" />;
}

export function BigButton({
  icon,
  label,
  onClick,
  dropdown,
  disabled,
  active,
  title,
  largeMenu,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
  dropdown?: DropdownContent;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  largeMenu?: boolean;
}) {
  const dd = useDropdown();
  const lines = label.split("\n");
  return (
    <>
      <button
        className={`rb-big ${active ? "active" : ""} ${dd.anchor ? "open" : ""}`}
        disabled={disabled}
        title={title ?? label.replace("\n", " ")}
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          if (dropdown && !onClick) dd.open(e.currentTarget);
          else onClick?.();
        }}
      >
        <Icon name={icon} size={32} />
        <span className="rb-big-label">
          {lines[0]}
          {lines.length > 1 ? (
            <>
              <br />
              {lines[1]}
              {dropdown && <Icon name="chevronDown" size={10} className="rb-caret" />}
            </>
          ) : (
            dropdown && (
              <>
                <br />
                <Icon name="chevronDown" size={10} className="rb-caret" />
              </>
            )
          )}
        </span>
      </button>
      {dd.anchor && dropdown && <DropdownLayer anchor={dd.anchor} content={dropdown} close={dd.close} large={largeMenu} />}
    </>
  );
}

/** Big button with a separate dropdown part (e.g. Paste). */
export function BigSplit({
  icon,
  label,
  onClick,
  dropdown,
  disabled,
  title,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  dropdown: DropdownContent;
  disabled?: boolean;
  title?: string;
}) {
  const dd = useDropdown();
  return (
    <div className={`rb-bigsplit ${dd.anchor ? "open" : ""}`}>
      <button className="rb-bigsplit-main" disabled={disabled} title={title ?? label} tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
        <Icon name={icon} size={32} />
      </button>
      <button
        className="rb-bigsplit-drop"
        disabled={disabled}
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => dd.open(e.currentTarget.parentElement!)}
      >
        {label}
        <Icon name="chevronDown" size={10} className="rb-caret" />
      </button>
      {dd.anchor && <DropdownLayer anchor={dd.anchor} content={dropdown} close={dd.close} />}
    </div>
  );
}

export function SmallButton({
  icon,
  label,
  onClick,
  dropdown,
  disabled,
  active,
  title,
  children,
}: {
  icon?: string;
  label?: string;
  onClick?: () => void;
  dropdown?: DropdownContent;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  children?: ReactNode;
}) {
  const dd = useDropdown();
  return (
    <>
      <button
        className={`rb-small ${active ? "active" : ""} ${dd.anchor ? "open" : ""} ${label ? "with-label" : ""}`}
        disabled={disabled}
        title={title ?? label}
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          if (dropdown && !onClick) dd.open(e.currentTarget);
          else onClick?.();
        }}
      >
        {children ?? (icon && <Icon name={icon} />)}
        {label && <span className="rb-small-label">{label}</span>}
        {dropdown && <Icon name="chevronDown" size={10} className="rb-caret" />}
      </button>
      {dd.anchor && dropdown && <DropdownLayer anchor={dd.anchor} content={dropdown} close={dd.close} />}
    </>
  );
}

/** Small button with separate arrow (Underline, Borders, AutoSum...). */
export function SplitButton({
  icon,
  label,
  onClick,
  dropdown,
  disabled,
  active,
  title,
  children,
}: {
  icon?: string;
  label?: string;
  onClick: () => void;
  dropdown: DropdownContent;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  children?: ReactNode;
}) {
  const dd = useDropdown();
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className={`rb-split ${active ? "active" : ""} ${dd.anchor ? "open" : ""}`}>
      <button
        className="rb-split-main"
        disabled={disabled}
        title={title ?? label}
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
      >
        {children ?? (icon && <Icon name={icon} />)}
        {label && <span className="rb-small-label">{label}</span>}
      </button>
      <button
        className="rb-split-drop"
        disabled={disabled}
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => dd.open(ref.current!)}
      >
        <Icon name="chevronDown" size={10} />
      </button>
      {dd.anchor && <DropdownLayer anchor={dd.anchor} content={dropdown} close={dd.close} />}
    </div>
  );
}

export function ColorSplit({
  icon,
  color,
  title,
  onPick,
  automaticLabel,
  noneLabel,
}: {
  icon: string;
  color: string;
  title: string;
  onPick: (c: string) => void;
  automaticLabel?: string;
  noneLabel?: string;
}) {
  const [last, setLast] = useState(color);
  return (
    <SplitButton
      title={title}
      onClick={() => onPick(last)}
      dropdown={(close) => (
        <ColorPicker
          automaticLabel={automaticLabel}
          noneLabel={noneLabel}
          onPick={(c) => {
            if (c) setLast(c);
            close();
            onPick(c);
          }}
        />
      )}
    >
      <span className="color-bar-icon">
        <Icon name={icon} />
        <span className="color-bar" style={{ background: last || "transparent" }} />
      </span>
    </SplitButton>
  );
}

/** Editable combo box (font name / size / number format). */
export function Combo({
  value,
  options,
  width,
  onCommit,
  renderOption,
  title,
  editable = true,
  className,
}: {
  value: string;
  options: string[];
  width: number;
  onCommit: (v: string) => void;
  renderOption?: (o: string) => ReactNode;
  title?: string;
  editable?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const closedAt = useRef(0);
  useEffect(() => setText(value), [value]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!anchor) return;
    const el = listRef.current?.querySelector(".combo-item.selected");
    el?.scrollIntoView({ block: "center" });
  }, [anchor]);

  const open = () => {
    if (Date.now() - closedAt.current < 250) return;
    setAnchor(wrap.current!.getBoundingClientRect());
  };
  const close = () => {
    closedAt.current = Date.now();
    setAnchor(null);
  };

  return (
    <div ref={wrap} className={`rb-combo ${anchor ? "open" : ""} ${className ?? ""}`} style={{ width }} title={title}>
      <input
        value={text}
        readOnly={!editable}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.target.select()}
        onMouseDown={(e) => {
          if (!editable) {
            e.preventDefault();
            open();
          }
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            onCommit(text);
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            setText(value);
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "ArrowDown" && e.altKey) open();
        }}
        onBlur={() => setText(value)}
      />
      <button tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={open}>
        <Icon name="chevronDown" size={10} />
      </button>
      {anchor && (
        <Popup anchor={anchor} onClose={close}>
          <div className="combo-list" ref={listRef} style={{ minWidth: width }}>
            {options.map((o) => (
              <div
                key={o}
                className={`combo-item ${o === value ? "selected" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  close();
                  onCommit(o);
                }}
              >
                {renderOption ? renderOption(o) : o}
              </div>
            ))}
          </div>
        </Popup>
      )}
    </div>
  );
}

export function CheckItem({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`rb-check ${disabled ? "disabled" : ""}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

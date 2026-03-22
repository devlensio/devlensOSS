export function Section({
  title, description, children,
}: {
  title:       string;
  description: string;
  children:    React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-primary">{title}</h3>
        <p className="text-xs text-muted mt-0.5">{description}</p>
      </div>
      <div className="space-y-3">
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <label className="text-xs text-muted w-24 pt-2.5 shrink-0 text-right">
        {label}
      </label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function Input({
  value, onChange, placeholder, type = "text", mono = false,
}: {
  value:       string;
  onChange:    (v: string) => void;
  placeholder?: string;
  type?:        string;
  mono?:        boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-elevated border border-border rounded-lg px-3 py-2
                  text-sm text-primary placeholder:text-dim
                  focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20
                  transition-all ${mono ? "font-mono" : ""}`}
    />
  );
}

export function Select({
  value, onChange, options,
}: {
  value:    string;
  onChange: (v: string) => void;
  options:  string[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-elevated border border-border rounded-lg px-3 py-2
                 text-sm text-primary font-mono
                 focus:outline-none focus:border-accent
                 transition-colors"
    >
      {options.map(o => (
        <option key={o} value={o} className="bg-elevated">
          {o}
        </option>
      ))}
    </select>
  );
}
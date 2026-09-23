'use client';

import { attributeDef, colorHex, type Facet } from '../lib/catalog';

/**
 * Extensible attribute renderer: Attribute → Type → Control.
 * COLOR → swatch · SIZE/SHOE_SIZE/CAPACITY/POWER → option buttons ·
 * MATERIAL/STYLE/BRAND → checkboxes. New attributes work without rewrites.
 */

export function Swatch({
  value,
  selected,
  disabled,
  onSelect,
  label,
}: {
  value: string;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  label?: string;
}) {
  const hex = colorHex(value);
  return (
    <button
      type="button"
      className={`swatch${selected ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}
      aria-pressed={selected}
      aria-label={label ?? value}
      title={value}
      disabled={disabled}
      onClick={onSelect}
    >
      {hex ? (
        <span className="swatch__dot" style={{ background: hex }} aria-hidden="true" />
      ) : (
        <span className="swatch__fallback" aria-hidden="true">{value.charAt(0).toUpperCase()}</span>
      )}
    </button>
  );
}

export function OptionButton({
  value,
  selected,
  disabled,
  onSelect,
}: {
  value: string;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      className={`variant-pill${selected ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
    >
      {value}
    </button>
  );
}

/** Checkbox facet row for filter panels (material, style, brand, …). */
export function FacetCheckbox({
  attribute,
  value,
  count,
  checked,
  onChange,
  idPrefix = '',
}: {
  attribute: string;
  value: string;
  count?: number;
  checked: boolean;
  onChange: (checked: boolean) => void;
  idPrefix?: string;
}) {
  const id = `${idPrefix}facet-${attribute}-${value}`.replace(/[^a-zA-Z0-9-_]/g, '-');
  return (
    <label className="facet-option" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{value}</span>
      {typeof count === 'number' ? <span className="facet-option__count">{count}</span> : null}
    </label>
  );
}

/** Render one filter facet with the control matching its attribute type. */
export function FacetControl({
  facet,
  selected,
  onToggle,
  idPrefix = '',
}: {
  facet: Facet;
  selected: string[];
  onToggle: (value: string) => void;
  idPrefix?: string;
}) {
  const def = attributeDef(facet.attribute);
  if (def.control === 'swatch') {
    return (
      <div className="filter-swatches" role="group" aria-label={`Filter by ${facet.attribute}`}>
        {facet.values.map(({ value }) => (
          <Swatch key={value} value={value} selected={selected.includes(value)} onSelect={() => onToggle(value)} label={`${facet.attribute}: ${value}`} />
        ))}
      </div>
    );
  }
  if (def.control === 'option') {
    return (
      <div className="variant-list" role="group" aria-label={`Filter by ${facet.attribute}`}>
        {facet.values.map(({ value }) => (
          <OptionButton key={value} value={value} selected={selected.includes(value)} onSelect={() => onToggle(value)} />
        ))}
      </div>
    );
  }
  return (
    <div role="group" aria-label={`Filter by ${facet.attribute}`}>
      {facet.values.map(({ value, count }) => (
        <FacetCheckbox
          key={value}
          attribute={facet.attribute}
          value={value}
          count={count}
          checked={selected.includes(value)}
          onChange={() => onToggle(value)}
          idPrefix={idPrefix}
        />
      ))}
    </div>
  );
}

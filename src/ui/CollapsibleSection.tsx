import React from 'react';

interface CollapsibleSectionProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  icon?: string;
  badge?: string | number;
  children: React.ReactNode;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  isOpen,
  onToggle,
  icon,
  badge,
  children,
}) => {
  return (
    <div className={`ui-collapsible-section ${isOpen ? 'open' : 'closed'}`}>
      <button
        type="button"
        className="ui-collapsible-header"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <div className="ui-collapsible-title-wrapper">
          <span className={`ui-chevron ${isOpen ? 'open' : ''}`}>▶</span>
          {icon && <span className="ui-collapsible-icon">{icon}</span>}
          <span className="ui-collapsible-title">{title}</span>
        </div>
        {badge !== undefined && <span className="ui-collapsible-badge">{badge}</span>}
      </button>

      {isOpen && <div className="ui-collapsible-body">{children}</div>}
    </div>
  );
};

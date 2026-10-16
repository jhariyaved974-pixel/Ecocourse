// <option>s for category selects. The tree has two levels, so products are
// best placed in a sub-category: each department becomes an <optgroup> of its
// sub-categories ("Electronics › Audio"). A department without sub-categories
// is offered on its own; a department that has them is only listed when it is
// the current value (so an existing assignment is never lost silently).

export interface CategoryOptionItem {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  isVisible?: boolean;
}

export function CategoryOptions({ categories, current }: { categories: CategoryOptionItem[]; current?: string }) {
  const ids = new Set(categories.map((c) => c.id));
  const departments = categories.filter((c) => !c.parentId || !ids.has(c.parentId));
  const label = (c: CategoryOptionItem) => `${c.path}${c.isVisible === false ? ' (hidden)' : ''}`;
  return (
    <>
      {departments.map((d) => {
        const children = categories.filter((c) => c.parentId === d.id);
        if (!children.length) {
          return (
            <option key={d.id} value={d.id}>
              {label(d)}
            </option>
          );
        }
        return (
          <optgroup key={d.id} label={`${d.name}${d.isVisible === false ? ' (hidden)' : ''}`}>
            {current === d.id ? <option value={d.id}>{`${d.name} (whole department)`}</option> : null}
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {label(c)}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}

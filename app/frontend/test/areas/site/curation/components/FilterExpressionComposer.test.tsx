/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FilterExpressionComposer from '../../../../../src/areas/site/curation/components/FilterExpressionComposer';
import {
  ActiveFilterExpressionTerm,
  FilterExpression,
  createDefaultFilterExpression
} from '../../../../../src/areas/site/curation/types/filterExpression';

const activeTerms: ActiveFilterExpressionTerm[] = [
  { filterId: 'alpha', mode: 'solo' },
  { filterId: 'beta', mode: 'solo' }
];
const filterNames = new Map([
  ['alpha', 'Alpha'],
  ['beta', 'Beta']
]);

function initialExpression(): FilterExpression {
  const expression = createDefaultFilterExpression(activeTerms);
  if (!expression) throw new Error('Expected an expression');
  return expression;
}

describe('FilterExpressionComposer', () => {
  it('only offers Mix view when at least two solo/hide controls are active', () => {
    const { rerender } = render(
      <FilterExpressionComposer
        expression={initialExpression()}
        activeTerms={[activeTerms[0]]}
        filterNames={filterNames}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /mix view/i })).not.toBeInTheDocument();

    rerender(
      <FilterExpressionComposer
        expression={initialExpression()}
        activeTerms={activeTerms}
        filterNames={filterNames}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /mix view/i })).toBeInTheDocument();
  });

  it('opens a plain-language expression editor and changes the group operator', () => {
    const onChange = vi.fn();
    render(
      <FilterExpressionComposer
        expression={initialExpression()}
        activeTerms={activeTerms}
        filterNames={filterNames}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /mix view/i }));
    expect(screen.getByRole('heading', { name: 'Mix the view' })).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ operator: 'intersection' }));
  });

  it('creates parentheses and accepts a dragged filter inside them', () => {
    const Harness = () => {
      const [expression, setExpression] = useState(initialExpression);
      return (
        <FilterExpressionComposer
          expression={expression}
          activeTerms={activeTerms}
          filterNames={filterNames}
          onChange={setExpression}
        />
      );
    };
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /mix view/i }));
    fireEvent.click(screen.getByRole('button', { name: /add parentheses/i }));

    const transfer = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: '',
      setData: (type: string, value: string) => transfer.set(type, value),
      getData: (type: string) => transfer.get(type) || ''
    };
    fireEvent.dragStart(screen.getByTitle('Drag Alpha'), { dataTransfer });
    fireEvent.drop(screen.getByText('Drop filters here'), { dataTransfer });

    const nestedGroup = screen.getByTestId('filter-expression-group-1');
    expect(within(nestedGroup).getByText('Alpha')).toBeInTheDocument();
  });
});

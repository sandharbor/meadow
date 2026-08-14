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
import FilterExpressionComposer from '../../../../../src/areas/bundle/curation/components/FilterExpressionComposer';
import {
  ActiveFilterExpressionTerm,
  FilterExpression,
  createDefaultFilterExpression
} from '../../../../../src/areas/bundle/curation/types/filterExpression';

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
  it('only offers Mix filters when at least two solo/hide controls are active', () => {
    const { rerender } = render(
      <FilterExpressionComposer
        expression={initialExpression()}
        activeTerms={[activeTerms[0]]}
        filterNames={filterNames}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /mix filters/i })).not.toBeInTheDocument();

    rerender(
      <FilterExpressionComposer
        expression={initialExpression()}
        activeTerms={activeTerms}
        filterNames={filterNames}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /mix filters/i })).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: /mix filters/i }));
    expect(screen.getByRole('heading', { name: 'Mix the filters' })).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();

    const anyButton = screen.getAllByRole('button', { name: 'Any' })[0];
    expect(anyButton).toHaveClass('bg-main-100', 'text-main-700');
    expect(anyButton).not.toHaveClass('bg-gray-800', 'text-white');

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ operator: 'intersection' }));
  });

  it('marks a changed mix as customized until it is reset', () => {
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

    expect(screen.queryByTestId('mix-filters-customized-indicator')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /mix filters/i }));
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByTestId('mix-filters-customized-indicator')).toHaveTextContent('Customized');

    fireEvent.click(screen.getByRole('button', { name: 'Reset mix' }));
    expect(screen.queryByTestId('mix-filters-customized-indicator')).not.toBeInTheDocument();
  });

  it('moves the Mix filters modal by dragging its title bar', () => {
    render(
      <FilterExpressionComposer
        expression={initialExpression()}
        activeTerms={activeTerms}
        filterNames={filterNames}
        onChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /mix filters/i }));

    const panel = screen.getByTestId('movable-modal-panel');
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      left: 200,
      top: 100,
      right: 840,
      bottom: 600,
      width: 640,
      height: 500,
      toJSON: () => ({}),
    });

    fireEvent.mouseDown(screen.getByTestId('movable-modal-title-bar'), { clientX: 300, clientY: 130 });
    fireEvent.mouseMove(document, { clientX: 380, clientY: 180 });
    expect(panel).toHaveStyle({ transform: 'translate(80px, 50px)' });
    fireEvent.mouseUp(document);
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
    fireEvent.click(screen.getByRole('button', { name: /mix filters/i }));
    fireEvent.click(screen.getByRole('button', { name: /add parentheses/i }));

    fireEvent.pointerDown(screen.getByTestId('filter:solo:alpha'), { button: 0 });
    fireEvent.pointerUp(screen.getByText('Drop filters here'));

    const nestedGroup = screen.getByTestId('filter-expression-group-1');
    expect(within(nestedGroup).getByText('Alpha')).toBeInTheDocument();
  });

  it('reorders two terms by dropping either card directly on the other', () => {
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
    fireEvent.click(screen.getByRole('button', { name: /mix filters/i }));

    const root = screen.getByTestId('filter-expression-solos');

    fireEvent.pointerDown(screen.getByTestId('filter:solo:alpha'), { button: 0 });
    fireEvent.pointerUp(screen.getByTestId('filter:solo:beta'));
    expect(within(root).getAllByTestId(/^filter:solo:/).map(card => card.getAttribute('data-testid')))
      .toEqual(['filter:solo:beta', 'filter:solo:alpha']);

    fireEvent.pointerDown(screen.getByTestId('filter:solo:beta'), { button: 0 });
    fireEvent.pointerUp(screen.getByTestId('filter:solo:alpha'));
    expect(within(root).getAllByTestId(/^filter:solo:/).map(card => card.getAttribute('data-testid')))
      .toEqual(['filter:solo:alpha', 'filter:solo:beta']);
  });
});

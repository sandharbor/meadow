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

export interface MdcDocument {
  format: 'mdc';
  source: string;
  references: CodeReference[];
}

export interface CodeReference {
  label: string;
  path: string;
  kind: 'module' | 'symbol' | 'type';
}

interface CodeReferenceToken {
  codeReference: CodeReference;
}

function escapeMdcAttribute(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

function renderCodeReference(reference: CodeReference): string {
  return `:code-ref{label="${escapeMdcAttribute(reference.label)}" path="${escapeMdcAttribute(reference.path)}" kind="${reference.kind}"}`;
}

function isCodeReferenceToken(value: unknown): value is CodeReferenceToken {
  return (
    typeof value === 'object' &&
    value !== null &&
    'codeReference' in value
  );
}

export function codeRef<T>(
  _importedValue: T,
  reference: CodeReference
): CodeReferenceToken {
  return { codeReference: reference };
}

export function typeRef<T>(
  reference: CodeReference
): CodeReferenceToken {
  void (undefined as T | undefined);
  return { codeReference: reference };
}

export function mdc(
  strings: TemplateStringsArray,
  ...values: Array<CodeReferenceToken | string | number | boolean>
): MdcDocument {
  const references: CodeReference[] = [];
  let source = strings[0] ?? '';

  values.forEach((value, index) => {
    if (isCodeReferenceToken(value)) {
      references.push(value.codeReference);
      source += renderCodeReference(value.codeReference);
    } else {
      source += String(value);
    }
    source += strings[index + 1] ?? '';
  });

  return {
    format: 'mdc',
    source,
    references,
  };
}

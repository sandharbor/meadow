/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import ts from 'typescript';
import type { ScenarioSection } from '../../../concepts/acceptance.js';

export type DocumentationEvent =
  | { kind: 'section'; section: ScenarioSection }
  | { kind: 'step'; text: string; status: string }
  | { kind: 'checkpoint'; index: number; message: string }
  | { kind: 'screenshot'; filename: string; docId: string };

export interface ScenarioDocumentation { events: DocumentationEvent[] }

interface CapturedCommand { id: number; line: number; text: string; status: string }
interface CapturedTick {
  timestamp: string;
  isCheckpoint?: boolean;
  checkpointMessage?: string;
  sourceCommand?: CapturedCommand;
}
export interface DocumentationCapture {
  testSource?: string;
  sections?: ScenarioSection[];
  ticks?: CapturedTick[];
  keyFrames?: { timestamp?: string; filename: string; docId: string }[];
}

/** Project only the walkthrough, without expanding captured file and service state. */
export function scenarioDocumentation(capture: DocumentationCapture): ScenarioDocumentation {
  const source = capture.testSource ?? '';
  const ast = ts.createSourceFile('scenario.ts', source, ts.ScriptTarget.Latest, true);
  const ranges: { id: string; start: number; end: number }[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'test.step') {
      const [title, callback] = node.arguments;
      if (title && ts.isPropertyAccessExpression(title) && title.expression.getText(ast) === 'sections.steps' && callback) {
        ranges.push({ id: title.name.text, start: ast.getLineAndCharacterOfPosition(callback.getStart(ast)).line + 1,
          end: ast.getLineAndCharacterOfPosition(callback.end).line + 1 });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const entries: { timestamp: string; line?: number; commandId?: number; event: DocumentationEvent }[] = [];
  const commands = new Map<number, CapturedCommand>();
  let checkpoint = 0;
  for (const tick of capture.ticks ?? []) {
    const command = tick.sourceCommand;
    if (command) {
      const previous = commands.get(command.id);
      if (previous) previous.status = command.status;
      else {
        commands.set(command.id, { ...command });
        if (!/^(?:await\s+)?(?:checkpoint|snapshot|addKeyFrame)\s*\(/.test(command.text)) {
          const step: DocumentationEvent = { kind: 'step', text: command.text, status: command.status };
          entries.push({ timestamp: tick.timestamp, line: command.line, commandId: command.id, event: step });
        }
      }
    }
    if (tick.isCheckpoint) entries.push({ timestamp: tick.timestamp, line: command?.line,
      event: { kind: 'checkpoint', index: ++checkpoint, message: tick.checkpointMessage ?? 'Checkpoint' } });
  }
  // A command spans several polling ticks; keep its final captured outcome.
  for (const entry of entries) {
    if (entry.event.kind === 'step') {
      const command = entry.commandId === undefined ? undefined : commands.get(entry.commandId);
      if (command) entry.event.status = command.status;
    }
  }
  for (const frame of capture.keyFrames ?? []) entries.push({ timestamp: frame.timestamp ?? '\uffff',
    event: { kind: 'screenshot', filename: frame.filename, docId: frame.docId } });
  entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const sections = capture.sections ?? [];
  const events: DocumentationEvent[] = [];
  let nextSection = 0;
  for (const entry of entries) {
    const range = entry.line === undefined ? undefined : ranges.find(range => entry.line! >= range.start && entry.line! <= range.end);
    const sectionIndex = range ? sections.findIndex(section => section.id === range.id) : -1;
    while (nextSection <= sectionIndex) events.push({ kind: 'section', section: sections[nextSection++] });
    events.push(entry.event);
  }
  while (nextSection < sections.length) events.push({ kind: 'section', section: sections[nextSection++] });
  return { events };
}

/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { SourceCommand } from '../artifacts/sourceCommand.js';

/** Command capture; source locations refer to this run's saved source. */
export class SourceCommandTracker {
  current: SourceCommand | undefined;
  private nextId = 0;
  private readonly commands = new Map<number, Omit<SourceCommand, 'id' | 'status'>>();

  constructor(private readonly file: string) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'sourceCommand') {
        const start = source.getLineAndCharacterOfPosition(node.getStart(source));
        const end = source.getLineAndCharacterOfPosition(node.getEnd() - 1);
        const callback = node.arguments[0];
        this.commands.set(start.line + 1, {
          file, line: start.line + 1, column: start.character + 1, endLine: end.line + 1,
          text: callback && ts.isArrowFunction(callback) ? callback.body.getText(source) : node.getText(source),
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  run = async <T>(action: () => T | Promise<T>): Promise<T> => {
    const frame = new Error().stack?.split('\n').find(line => line.includes(`${this.file}:`));
    const position = frame?.slice(frame.indexOf(`${this.file}:`) + this.file.length + 1).match(/^(\d+):(\d+)/);
    const location = position && this.commands.get(Number(position[1]));
    if (!location) throw new Error('Cannot locate sourceCommand in the captured scenario source');
    const command: SourceCommand = { ...location, id: this.nextId++, status: 'running' };
    this.current = command;
    try {
      const result = await action();
      command.status = 'completed';
      return result;
    } catch (error) {
      command.status = 'failed';
      throw error;
    }
  };
}

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

export interface NodePosition {
  x: number;
  y: number;
}

export interface SelectionBox {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_VIEWBOX: ViewBox = { x: 0, y: 0, width: 300, height: 200 };
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 10;

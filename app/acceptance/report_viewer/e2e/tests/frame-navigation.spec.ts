/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '@playwright/test';
import { createFrameNavigationFixture } from '../fixtures/frame-navigation-fixture.js';

/*
 * Step through a recording one frame at a time while holding Shift, including at
 * slow playback speed and both ends of the video. Plain arrows still jump between
 * review ticks, and the selected review follows frame movement across a tick.
 */
test('Shift arrows step recorded frames while plain arrows navigate ticks', async ({ page }) => {
  // --- Setup ---
  const fixture = createFrameNavigationFixture(true);
  try {
    await page.goto(fixture.url);
    const video = page.locator('video');
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).duration)).toBeGreaterThan(4);
    const time = () => video.evaluate(element => (element as HTMLVideoElement).currentTime);
    const selectedLine = page.locator('.code-line.bg-orange-100');
    await expect(selectedLine).toHaveAttribute('data-source-line', '1');

    // --- Test start ---
    // Jump to a tick, then move by individual frames.
    await page.keyboard.press('ArrowRight');
    await expect.poll(time).toBeCloseTo(2);
    await expect(selectedLine).toHaveAttribute('data-source-line', '2');
    await page.keyboard.down('Shift');
    for (const target of [2.04, 2.08]) {
      const decodedFrame = video.evaluate(element => new Promise<number>(resolve => {
        (element as HTMLVideoElement).requestVideoFrameCallback((_now, metadata) => resolve(metadata.mediaTime));
      }));
      await page.keyboard.press('ArrowRight');
      await expect.poll(time).toBeCloseTo(target);
      expect(await decodedFrame).toBeCloseTo(target);
    }
    for (const target of [2.04, 2, 1.96]) {
      await page.keyboard.press('ArrowLeft');
      await expect.poll(time).toBeCloseTo(target);
    }
    await page.keyboard.up('Shift');
    await expect(selectedLine).toHaveAttribute('data-source-line', '1');
    expect(await video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(true);

    // Plain arrows still select complete review ticks.
    await page.keyboard.press('ArrowRight');
    await expect(selectedLine).toHaveAttribute('data-source-line', '2');
    await page.keyboard.press('ArrowRight');
    await expect.poll(time).toBeCloseTo(4);
    await expect(selectedLine).toHaveAttribute('data-source-line', '3');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(time).toBeCloseTo(2);

    // Playback speed does not change frame size or steal slider keys.
    const speed = page.getByRole('slider', { name: 'Playback speed' });
    await speed.press('Home');
    await speed.press('Shift+ArrowRight');
    await expect.poll(time).toBeCloseTo(2);
    await speed.press('Home');
    await speed.evaluate(element => (element as { blur(): void }).blur());
    await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(time).toBeCloseTo(2.04);
    expect(await video.evaluate(element => (element as HTMLVideoElement).playbackRate)).toBeCloseTo(0.07);

    // A step pauses active playback.
    await page.keyboard.press('Space');
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(false);
    await page.keyboard.press('Shift+ArrowLeft');
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(true);

    // Clamp at the first and last recorded frames.
    await video.evaluate(element => { (element as HTMLVideoElement).currentTime = 0; });
    await page.keyboard.press('Shift+ArrowLeft');
    await expect.poll(time).toBe(0);
    const duration = await video.evaluate(element => {
      const media = element as HTMLVideoElement;
      media.currentTime = media.duration;
      return media.duration;
    });
    const lastFrameTime = (Math.ceil(duration * 25) - 1) / 25;
    await page.keyboard.press('Shift+ArrowLeft');
    await expect.poll(time).toBeCloseTo(lastFrameTime - 0.04);
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(time).toBeCloseTo(lastFrameTime);
  } finally {
    await page.goto('about:blank');
    fixture.cleanup();
  }
});

/*
 * Open a recording without tick data. Shift arrows should still move through its
 * frames, so fine-grained video inspection does not depend on captured state.
 */
test('Shift arrows also step recordings without ticks', async ({ page }) => {
  // --- Setup ---
  const fixture = createFrameNavigationFixture(false);
  try {
    await page.goto(fixture.url);
    const video = page.locator('video');
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).duration)).toBeGreaterThan(4);

    // --- Test start ---
    // Move forward and back without any tick navigation.
    await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeCloseTo(0.04);
    await page.keyboard.press('Shift+ArrowLeft');
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBe(0);
  } finally {
    await page.goto('about:blank');
    fixture.cleanup();
  }
});

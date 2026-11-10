import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindCameraControls } from '../public/js/camera-controls.js';

function setup() {
  const handlers = new Map();
  const captured = [];
  const canvas = {
    addEventListener(type, handler) { handlers.set(type, handler); },
    setPointerCapture(id) { captured.push(id); },
  };
  let yaw = 0;
  let distance = 9;
  bindCameraControls(canvas, (delta) => { yaw += delta; }, (delta) => {
    distance = Math.min(18, Math.max(7, distance + delta));
  });
  return {
    captured,
    get yaw() { return yaw; },
    get distance() { return distance; },
    emit(type, properties) {
      const event = { button: 0, clientX: 0, clientY: 0, ...properties, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; } };
      handlers.get(type)(event);
      return event;
    },
  };
}

test('primary mouse and pen drags rotate until released or cancelled', () => {
  const c = setup();
  c.emit('pointerdown', { pointerType: 'mouse', pointerId: 1, clientX: 10 });
  c.emit('pointermove', { pointerType: 'mouse', pointerId: 1, clientX: 60 });
  assert.equal(c.yaw, 0.3);
  assert.deepEqual(c.captured, [1]);
  c.emit('pointerup', { pointerType: 'mouse', pointerId: 1 });
  c.emit('pointermove', { pointerType: 'mouse', pointerId: 1, clientX: 90 });
  c.emit('pointerdown', { pointerType: 'mouse', pointerId: 2, button: 2 });
  c.emit('pointermove', { pointerType: 'mouse', pointerId: 2, clientX: 100 });
  assert.equal(c.yaw, 0.3);
  c.emit('pointerdown', { pointerType: 'pen', pointerId: 3, clientX: 10 });
  c.emit('pointermove', { pointerType: 'pen', pointerId: 3, clientX: 20 });
  c.emit('pointercancel', { pointerType: 'pen', pointerId: 3 });
  c.emit('pointermove', { pointerType: 'pen', pointerId: 3, clientX: 100 });
  assert.equal(c.yaw, 0.36);
});

test('touch drag transitions to pinch and back without camera jumps', () => {
  const c = setup();
  c.emit('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 100 });
  c.emit('pointermove', { pointerType: 'touch', pointerId: 1, clientX: 120 });
  assert.equal(c.yaw, 0.12);
  c.emit('pointerdown', { pointerType: 'touch', pointerId: 2, clientX: 200 });
  assert.deepEqual(c.captured, [1, 2]);
  c.emit('pointermove', { pointerType: 'touch', pointerId: 2, clientX: 220 });
  assert.equal(c.distance, 8);
  assert.equal(c.yaw, 0.12);
  c.emit('pointermove', { pointerType: 'touch', pointerId: 2, clientX: 200 });
  assert.equal(c.distance, 9);
  c.emit('pointerup', { pointerType: 'touch', pointerId: 2 });
  c.emit('pointermove', { pointerType: 'touch', pointerId: 1, clientX: 130 });
  assert.equal(c.yaw, 0.18);
  c.emit('lostpointercapture', { pointerType: 'touch', pointerId: 1 });
  c.emit('pointermove', { pointerType: 'touch', pointerId: 1, clientX: 300 });
  assert.equal(c.yaw, 0.18);
});

test('extra touches suspend gestures and cancellation rebases the pinch', () => {
  const c = setup();
  c.emit('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 10 });
  c.emit('pointerdown', { pointerType: 'touch', pointerId: 2, clientX: 100 });
  c.emit('pointerdown', { pointerType: 'touch', pointerId: 3, clientX: 150 });
  c.emit('pointermove', { pointerType: 'touch', pointerId: 2, clientX: 120 });
  assert.equal(c.distance, 9);
  assert.equal(c.yaw, 0);
  c.emit('pointercancel', { pointerType: 'touch', pointerId: 3 });
  c.emit('pointermove', { pointerType: 'touch', pointerId: 2, clientX: 130 });
  assert.equal(c.distance, 8);
});

test('wheel zooms, including Ctrl+wheel without browser zoom', () => {
  const c = setup();
  const wheel = c.emit('wheel', { deltaY: 20, ctrlKey: false });
  assert.equal(c.distance, 10);
  assert.equal(wheel.defaultPrevented, false);
  const pinch = c.emit('wheel', { deltaY: -20, ctrlKey: true });
  assert.equal(c.distance, 9);
  assert.equal(pinch.defaultPrevented, true);
});

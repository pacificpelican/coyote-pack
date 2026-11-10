export function bindCameraControls(canvas, rotate, zoom) {
  let drag = null;
  let pinchDistance = null;
  const touches = new Map();

  function resetTouchGesture() {
    pinchDistance = null;
    drag = null;
    if (touches.size === 1) {
      const [id, point] = touches.entries().next().value;
      drag = { id, x: point.x };
    } else if (touches.size === 2) {
      const [a, b] = touches.values();
      pinchDistance = Math.hypot(b.x - a.x, b.y - a.y);
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      resetTouchGesture();
    } else {
      if ((e.pointerType === 'mouse' && e.button !== 0) || touches.size || drag) return;
      drag = { id: e.pointerId, x: e.clientX };
    }
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    const touch = touches.get(e.pointerId);
    if (touch) {
      touch.x = e.clientX;
      touch.y = e.clientY;
      if (touches.size === 2) {
        const [a, b] = touches.values();
        const distance = Math.hypot(b.x - a.x, b.y - a.y);
        zoom(-Math.sign(distance - pinchDistance));
        pinchDistance = distance;
        return;
      }
    }
    if (drag && drag.id === e.pointerId) {
      rotate((e.clientX - drag.x) * 0.006);
      drag.x = e.clientX;
    }
  });

  const end = (e) => {
    if (touches.delete(e.pointerId)) resetTouchGesture();
    else if (drag && drag.id === e.pointerId) drag = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', end);
  canvas.addEventListener('wheel', (e) => {
    if (e.ctrlKey) e.preventDefault();
    zoom(Math.sign(e.deltaY));
  }, { passive: false });
}

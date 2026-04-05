import { setCutawayDepth } from '../core/GameState.js';
import { TERRAIN_SURFACE_Y } from '../core/Config.js';

class DepthSlider {
  init() {
    this.slider = document.getElementById('depth-slider');
    this.valueDisplay = document.getElementById('depth-value');

    // Initial state: show the surface with entrance cavern
    this.slider.value = TERRAIN_SURFACE_Y + 4;
    this._update();

    this.slider.addEventListener('input', () => this._update());

    // Ctrl+scroll to adjust depth
    window.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const step = e.deltaY > 0 ? -1 : 1;
      this.slider.value = parseFloat(this.slider.value) + step;
      this._update();
    }, { passive: false });
  }

  _update() {
    const y = parseFloat(this.slider.value);
    setCutawayDepth(y);

    // Display depth below surface
    const depthBelowSurface = Math.max(0, Math.round(TERRAIN_SURFACE_Y - y));
    this.valueDisplay.textContent = depthBelowSurface;
  }
}

export default new DepthSlider();

import { setCutawayDepth } from '../core/GameState.js';
import { TERRAIN_SURFACE_Y } from '../core/Config.js';

class DepthSlider {
  constructor() {
    this._locked = false;
  }

  init() {
    this.slider = document.getElementById('depth-slider');
    this.valueDisplay = document.getElementById('depth-value');
    this.lockBtn = document.getElementById('depth-lock');

    // Initial state: show the surface with entrance cavern
    this.slider.value = TERRAIN_SURFACE_Y + 4;
    this._update();

    this.slider.addEventListener('input', () => {
      if (this._locked) return;
      this._update();
    });

    this.lockBtn.addEventListener('click', () => this._toggleLock());

    // Ctrl+scroll to adjust depth
    window.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (this._locked) return;
      const step = e.deltaY > 0 ? -1 : 1;
      this.slider.value = parseFloat(this.slider.value) + step;
      this._update();
    }, { passive: false });
  }

  _toggleLock() {
    this._locked = !this._locked;
    this.lockBtn.textContent = this._locked ? 'LOCKED' : 'LOCK';
    this.lockBtn.classList.toggle('locked', this._locked);
    this.slider.style.opacity = this._locked ? '0.4' : '';
    this.slider.style.pointerEvents = this._locked ? 'none' : '';
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

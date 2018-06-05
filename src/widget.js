/*
 * OS.js - JavaScript Cloud/Web Desktop Platform
 *
 * Copyright (c) 2011-2018, Anders Evenrud <andersevenrud@gmail.com>
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * @author  Anders Evenrud <andersevenrud@gmail.com>
 * @licence Simplified BSD License
 */
import {EventHandler} from '@osjs/common';

const MIN_WIDTH = 200;
const MIN_HEIGHT = 200;
const MAX_WIDTH = 800;
const MAX_HEIGHT = 800;
const DEFAULT_MARGIN = 15;
const EMIT_TIMEOUT = 44;

const isNull = val => typeof val === 'undefined' || val === null;

const getPosition = (core, position, nullValue = null) => {
  const rect = core.make('osjs/desktop').getRect();
  let {top, left, right, bottom} = position;

  if (isNull(left) && isNull(right)) {
    left = rect.left + DEFAULT_MARGIN;
  } else if (!isNull(left)) {
    right = nullValue;
  } else {
    left = nullValue;
  }

  if (isNull(top) && isNull(bottom)) {
    top = rect.top + DEFAULT_MARGIN;
  } else if (!isNull(top)) {
    bottom = nullValue;
  } else {
    top = nullValue;
  }

  return {top, left, right, bottom};
};

const animator = (fps) => {
  const interval = 1000 / fps;
  let last = performance.now();

  const animate = (cb) => {
    const now = performance.now();
    const elapsed = now - last;

    if (elapsed > interval) {
      last = now - (elapsed % interval);

      cb();
    }

    requestAnimationFrame(() => animate(cb));
  };

  return animate;
};

const onmousedown = (ev, $root, widget) => {
  let debounce;
  const startX = ev.clientX;
  const startY = ev.clientY;
  const startPosition = {
    left: widget.$element.offsetLeft,
    top: widget.$element.offsetTop
  };
  const startDimension = Object.assign({}, widget.settings.dimension);
  const resize = ev.target.classList.contains('osjs-widget-resize');
  const {minDimension, maxDimension} = widget.attributes;

  const mousemove = ev => {
    const diffX = ev.clientX - startX;
    const diffY = ev.clientY - startY;

    // TODO: Aspect Ratio

    clearTimeout(debounce);

    if (resize) {
      let newWidth = startDimension.width + diffX;
      let newHeight = startDimension.height + diffY;
      newWidth = Math.min(maxDimension.width, Math.max(minDimension.width, newWidth));
      newHeight = Math.min(maxDimension.height, Math.max(minDimension.height, newHeight));

      widget.settings.dimension.width = newWidth;
      widget.settings.dimension.height = newHeight;
      widget.updateDimension();
      debounce = setTimeout(() => widget.emit('resize'), EMIT_TIMEOUT);
    } else {
      widget.settings.position.top = startPosition.top + diffY;
      widget.settings.position.left = startPosition.left + diffX;
      widget.updatePosition();
      debounce = setTimeout(() => widget.emit('move'), EMIT_TIMEOUT);
    }
  };

  const mouseup = ev => {
    window.removeEventListener('mousemove', mousemove);
    window.removeEventListener('mouseup', mouseup);

    widget.$element.classList.remove('active');
    $root.setAttribute('data-window-action', String(false));
  };

  window.addEventListener('mousemove', mousemove);
  window.addEventListener('mouseup', mouseup);

  widget.$element.classList.add('active');
  $root.setAttribute('data-window-action', String(true));
};

export default class Widget extends EventHandler {

  constructor(core, options, attrs = {}, settings = {}) {
    super('Widget');

    this.core = core;
    this.$element = document.createElement('div');
    this.$canvas = document.createElement('canvas');
    this.context = this.$canvas.getContext('2d');
    this.options = options;
    this.attributes = Object.assign({}, {
      aspect: false,
      canvas: true,
      fps: 1,
      position: {
        top: null,
        left: null,
        right: null,
        bottom: null,
      },
      dimension: {
        width: MIN_WIDTH,
        height: MIN_HEIGHT,
      },
      minDimension: null,
      maxDimension: {
        width: MAX_WIDTH,
        height: MAX_HEIGHT
      }
    }, attrs);

    if (this.attributes.minDimension === null) {
      this.attributes.minDimension = Object.assign({
        width: MIN_WIDTH,
        height: MIN_HEIGHT,
      }, this.attributes.dimension);
    }

    if (this.attributes.aspect === true) {
      const {width, height} = this.attributes.dimension;
      const {maxDimension} = this.attributes;
      const aspect = width / height;

      this.attributes.aspect = aspect;
      this.attributes.minDimension.height = width / aspect;
      this.attributes.maxDimension.height = maxDimension.width * aspect;
    }

    // TODO: Save settings
    this.settings = Object.assign({
      position: {
        top: null,
        left: null,
        right: null,
        bottom: null,
      },
      dimension: Object.assign({}, this.attributes.dimension)
    }, settings);
  }

  destroy() {
    this.emit('destroy', this);

    if (this.$element) {
      if (this.$element.parentNode) {
        this.$element.remove();
      }
    }

    this.$canvas = null;
    this.$element = null;
  }

  render() {

  }

  start() {
    const render = () => this.render({
      width: this.settings.dimension.width,
      height: this.settings.dimension.height,
      canvas: this.$canvas,
      context: this.context
    });

    this.updateDimension();
    this.updatePosition();
    this.emit('resize,move');

    render();

    if (this.attributes.canvas) {
      animator(this.attributes.fps)(() => render());
    }
  }

  init() {
    const $el = this.$element;
    const $root = this.core.$root;

    const resizer = document.createElement('div');
    resizer.classList.add('osjs-widget-resize');

    $el.appendChild(resizer);
    $el.addEventListener('mousedown', ev => onmousedown(ev, $root, this));
    $el.addEventListener('contextmenu', ev => this.emit('contextmenu', ev));
    $el.classList.add('osjs-widget');
    $root.appendChild($el);

    if (this.attributes.canvas) {
      $el.appendChild(this.$canvas);
    }

    this.start();
  }

  updateDimension() {
    const {width, height} = this.settings.dimension;
    this.$element.style.width = String(width) + 'px';
    this.$element.style.height = String(height) + 'px';
    this.$canvas.width = width;
    this.$canvas.height = height;
  }

  updatePosition() {
    const {left, right, top, bottom} = getPosition(this.core, this.settings.position, 'auto');
    const getValue = val => typeof val === 'string' ? val : `${val}px`;

    this.$element.style.left = getValue(left);
    this.$element.style.right = getValue(right);
    this.$element.style.top = getValue(top);
    this.$element.style.bottom = getValue(bottom);
  }

}
